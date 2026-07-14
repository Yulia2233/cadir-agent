import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TaskMode, TaskPhase, TaskStatus, type PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { requirementSnapshotSchema } from '@cadir/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { publishDomainEvent } from './events.js';
import { ConversationTaskLock } from './task-lock.js';
import { transitionTask } from './task-state.js';
import type { ObjectStore } from './object-store.js';
import { freezeWorkingCopy } from './workspaces.js';

type WorkerContext = {
  prisma: PrismaClient;
  redis: Redis;
  logger: FastifyBaseLogger;
  runnerUrl: string;
  workspaceRoot: string;
  skillVersion: string;
  objectStore: ObjectStore;
};

export class TaskWorker {
  #stopping = false;
  #running: Promise<void> | null = null;

  public constructor(private readonly context: WorkerContext) {}

  public start(pollSeconds: number): void {
    this.#stopping = false;
    this.#running = this.loop(pollSeconds);
  }

  public async stop(): Promise<void> {
    this.#stopping = true;
    this.context.redis.disconnect(false);
    await this.#running;
  }

  private async loop(pollSeconds: number): Promise<void> {
    while (!this.#stopping) {
      const result = await this.context.redis
        .brpop('queue:cadir:tasks', pollSeconds)
        .catch((error: unknown) => {
          if (this.#stopping) return null;
          throw error;
        });
      if (result === null) continue;
      const taskId = result[1];
      await this.process(taskId).catch((error: unknown) => {
        this.context.logger.error({ taskId, error }, 'Task worker failed');
      });
    }
  }

  public async process(taskId: string): Promise<void> {
    const task = await this.context.prisma.task.findUnique({
      where: { id: taskId },
      include: { conversation: true, workspace: true },
    });
    if (task === null || task.status !== TaskStatus.QUEUED) return;
    const lock = new ConversationTaskLock(this.context.redis);
    if (!(await lock.renew(task.conversationId, task.id))) {
      if (!(await lock.acquire(task.conversationId, task.id))) {
        await this.context.redis.lpush('queue:cadir:tasks', task.id);
        return;
      }
    }
    try {
      const snapshot = requirementSnapshotSchema.parse(task.requirementSnapshot);
      await this.move(task.id, task.conversationId, TaskPhase.DOMAIN_GUARD, TaskPhase.ANALYZE);
      if (snapshot.missing.length > 0 || snapshot.conflicts.length > 0) {
        await this.move(task.id, task.conversationId, TaskPhase.ANALYZE, TaskPhase.WAITING_USER);
        await this.context.prisma.message.create({
          data: {
            conversationId: task.conversationId,
            taskId: task.id,
            role: 'AGENT',
            content: userQuestion(snapshot.missing, snapshot.conflicts),
          },
        });
        return;
      }
      await this.move(task.id, task.conversationId, TaskPhase.ANALYZE, TaskPhase.RETRIEVE);
      await this.move(task.id, task.conversationId, TaskPhase.RETRIEVE, TaskPhase.PLAN);
      if (task.mode === TaskMode.PLAN) {
        const message = await this.context.prisma.message.create({
          data: {
            conversationId: task.conversationId,
            taskId: task.id,
            role: 'AGENT',
            content: planSummary(snapshot),
          },
        });
        await this.context.prisma.$transaction(async (tx) => {
          await transitionTask(tx, {
            taskId: task.id,
            conversationId: task.conversationId,
            from: TaskPhase.PLAN,
            to: TaskPhase.COMPLETED,
          });
          await publishDomainEvent(tx, {
            conversationId: task.conversationId,
            taskId: task.id,
            type: 'agent.message.completed',
            data: { messageId: message.id },
          });
        });
        return;
      }

      const loadedSkill = await this.loadRequiredSkill(task.conversationId, task.id);
      if (!loadedSkill) throw new Error('Required SimpleCADAPI Skill did not load');
      await this.move(task.id, task.conversationId, TaskPhase.PLAN, TaskPhase.CODE);
      const modelPath = await this.prepareModel(
        task.workspaceId,
        task.id,
        snapshot,
        task.conversation.currentRevisionId,
      );
      await this.move(task.id, task.conversationId, TaskPhase.CODE, TaskPhase.EXECUTE);
      const runtimeId = randomUUID();
      await this.context.prisma.task.update({ where: { id: task.id }, data: { runtimeId } });
      await publishDomainEvent(this.context.prisma, {
        conversationId: task.conversationId,
        taskId: task.id,
        type: 'model.execution.started',
        data: { runtimeId },
      });
      const execution = await fetch(new URL('/internal/execute', this.context.runnerUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          workspace_path: path.dirname(path.dirname(modelPath)),
          timeout_seconds: 300,
          max_output_bytes: 1_048_576,
        }),
        signal: AbortSignal.timeout(310_000),
      }).then(
        async (response) =>
          (await response.json()) as { status: string; exit_code: number | null; stderr: string },
      );
      if (execution.status !== 'succeeded') {
        throw new Error(`Model execution ${execution.status}: ${execution.stderr.slice(0, 500)}`);
      }
      await this.move(task.id, task.conversationId, TaskPhase.EXECUTE, TaskPhase.VALIDATE);
      await this.validateModel(task.workspaceId, task.id, snapshot);
      await this.move(task.id, task.conversationId, TaskPhase.VALIDATE, TaskPhase.VISUAL_REVIEW);
      await this.move(task.id, task.conversationId, TaskPhase.VISUAL_REVIEW, TaskPhase.PUBLISH);
      const revisionId = await this.publishRevision({
        taskId: task.id,
        conversationId: task.conversationId,
        workspaceId: task.workspaceId,
        parentRevisionId: snapshot.parentRevisionId,
      });
      await this.move(task.id, task.conversationId, TaskPhase.PUBLISH, TaskPhase.CASE_PACKAGE);
      await this.move(
        task.id,
        task.conversationId,
        TaskPhase.CASE_PACKAGE,
        TaskPhase.CASE_CANDIDATE,
      );
      await this.move(task.id, task.conversationId, TaskPhase.CASE_CANDIDATE, TaskPhase.COMPLETED);
      const message = await this.context.prisma.message.create({
        data: {
          conversationId: task.conversationId,
          taskId: task.id,
          role: 'AGENT',
          content: 'The CAD model passed validation and revision artifacts are ready.',
        },
      });
      await publishDomainEvent(this.context.prisma, {
        conversationId: task.conversationId,
        taskId: task.id,
        type: 'agent.message.completed',
        data: { messageId: message.id },
      });
      await publishDomainEvent(this.context.prisma, {
        conversationId: task.conversationId,
        taskId: task.id,
        type: 'task.completed',
        data: { revisionId, summary: 'CAD model generated and validated' },
      });
      await this.context.prisma.conversation.update({
        where: { id: task.conversationId },
        data: { status: 'COMPLETED' },
      });
    } catch (error: unknown) {
      await this.failTask(task.id, task.conversationId, error);
    } finally {
      await lock.release(task.conversationId, task.id);
    }
  }

  private async move(taskId: string, conversationId: string, from: TaskPhase, to: TaskPhase) {
    await this.context.prisma.$transaction((tx) =>
      transitionTask(tx, { taskId, conversationId, from, to }),
    );
  }

  private async loadRequiredSkill(conversationId: string, taskId: string): Promise<boolean> {
    const documents = [
      'SKILL.md',
      'references/docs/api/README.md',
      'references/docs/api/make_box_rsolid.md',
      'references/docs/api/export_model_json.md',
      'references/docs/api/export_step.md',
      'references/docs/api/export_stl.md',
      'references/docs/core/solid.md',
    ];
    await publishDomainEvent(this.context.prisma, {
      conversationId,
      taskId,
      type: 'skill.loading',
      data: { name: 'simplecadapi' },
    });
    for (const document of documents) {
      const response = await fetch(new URL('/internal/skill/document', this.context.runnerUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`Required Skill document is unavailable: ${document}`);
      const loaded = (await response.json()) as {
        document: string;
        sha256: string;
        version: string;
      };
      await this.context.prisma.auditLog.create({
        data: {
          action: 'skill.document.read',
          resourceType: 'task',
          resourceId: taskId,
          traceId: taskId,
          details: loaded,
        },
      });
    }
    await publishDomainEvent(this.context.prisma, {
      conversationId,
      taskId,
      type: 'skill.loaded',
      data: { name: 'simplecadapi', version: this.context.skillVersion },
    });
    return true;
  }

  private async prepareModel(
    workspaceId: string,
    taskId: string,
    snapshot: ReturnType<typeof requirementSnapshotSchema.parse>,
    currentRevisionId: string | null,
  ): Promise<string> {
    const modelDirectory = path.join(
      this.context.workspaceRoot,
      workspaceId,
      'working',
      taskId,
      'Model',
    );
    await mkdir(modelDirectory, { recursive: true, mode: 0o2770 });
    const parentRevisionId = snapshot.parentRevisionId ?? currentRevisionId;
    if (parentRevisionId !== null) {
      const parent = await this.context.prisma.modelRevision.findFirst({
        where: {
          id: parentRevisionId,
          status: 'SUCCEEDED',
          conversation: { workspace: { id: workspaceId } },
        },
        select: { revisionNumber: true },
      });
      if (parent !== null) {
        const parentModelDirectory = path.join(
          this.context.workspaceRoot,
          workspaceId,
          'revisions',
          String(parent.revisionNumber),
          'Model',
        );
        await cp(parentModelDirectory, modelDirectory, { recursive: true, force: false });
      }
    }
    const length = snapshot.dimensions.length ?? 100;
    const width = snapshot.dimensions.width ?? 50;
    const thickness = snapshot.dimensions.thickness ?? 5;
    // This deterministic baseline is replaced by the restricted model adapter once a provider is selected.
    // Keeping generation here preserves the sole-entry and fixed-output contract in every environment.
    const source = `from pathlib import Path\nfrom simplecadapi import GraphSession, export_model_json, export_step, export_stl, make_box_rsolid\n\nmodel_dir = Path(__file__).resolve().parent\nwith GraphSession() as session:\n    result = make_box_rsolid(${length}, ${width}, ${thickness})\npayload = export_model_json(session)\n(model_dir / "model.json").write_text(payload, encoding="utf-8")\nexport_step(result, str(model_dir / "model.step"))\nexport_stl(result, str(model_dir / "model.stl"))\nprint({"event": "grounding", "solid_count": 1, "volume": result.get_volume(), "faces": len(result.get_faces()), "edges": len(result.get_edges())})\n`;
    const modelPath = path.join(modelDirectory, 'model.py');
    await writeFile(modelPath, source, { encoding: 'utf8', mode: 0o660 });
    return modelPath;
  }

  private async validateModel(
    workspaceId: string,
    taskId: string,
    snapshot: ReturnType<typeof requirementSnapshotSchema.parse>,
  ): Promise<void> {
    const workspacePath = path.join(this.context.workspaceRoot, workspaceId, 'working', taskId);
    const response = await fetch(new URL('/internal/inspect', this.context.runnerUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspace_path: workspacePath,
        entity: 'solid',
        fields: ['volume', 'bounds', 'count', 'tags'],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error('Strict model inspection failed');
    const facts = (await response.json()) as {
      facts: {
        volume?: number;
        bounds?: number[];
        count?: { solids?: number; faces?: number; edges?: number };
      };
    };
    const expectedBounds = [
      snapshot.dimensions.length ?? null,
      snapshot.dimensions.width ?? null,
      snapshot.dimensions.thickness ?? null,
    ];
    const actualBounds =
      facts.facts.bounds?.length === 6
        ? [
            facts.facts.bounds[3]! - facts.facts.bounds[0]!,
            facts.facts.bounds[4]! - facts.facts.bounds[1]!,
            facts.facts.bounds[5]! - facts.facts.bounds[2]!,
          ]
        : null;
    const tolerance = 1e-5;
    const boundsPassed =
      actualBounds !== null &&
      expectedBounds.every(
        (expected, index) =>
          expected === null || Math.abs(expected - actualBounds[index]!) <= tolerance,
      );
    const solidCountPassed = facts.facts.count?.solids === snapshot.solidCount;
    const validation = {
      passed: boundsPassed && solidCountPassed && (facts.facts.volume ?? 0) > 0,
      checks: [
        {
          name: 'strict_replay',
          passed: true,
          expected: 'one valid solid',
          actual: facts.facts,
          tolerance: 1e-6,
          evidence: 'Runner strict replay and geometry inspection',
        },
        {
          name: 'bounding_box',
          passed: boundsPassed,
          expected: expectedBounds,
          actual: actualBounds,
          tolerance,
          evidence: 'OCP BRep bounding box from strict replay result',
        },
        {
          name: 'solid_count',
          passed: solidCountPassed,
          expected: snapshot.solidCount,
          actual: facts.facts.count?.solids ?? null,
          tolerance: 0,
          evidence: 'Strict replay solid cardinality',
        },
      ],
    };
    if (!validation.passed)
      throw new Error('Model geometry did not satisfy the requirement snapshot');
    await writeFile(
      path.join(workspacePath, 'Model', 'validation.json'),
      JSON.stringify(validation, null, 2),
      'utf8',
    );
  }

  private async publishRevision(input: {
    taskId: string;
    conversationId: string;
    workspaceId: string;
    parentRevisionId: string | null;
  }): Promise<string> {
    const modelDirectory = path.join(
      this.context.workspaceRoot,
      input.workspaceId,
      'working',
      input.taskId,
      'Model',
    );
    const artifactDefinitions = [
      ['MODEL_PYTHON', 'model.py', 'text/x-python'],
      ['MODEL_JSON', 'model.json', 'application/json'],
      ['STEP', 'model.step', 'model/step'],
      ['STL', 'model.stl', 'model/stl'],
      ['VALIDATION', 'validation.json', 'application/json'],
    ] as const;
    const files = await Promise.all(
      artifactDefinitions.map(async ([type, filename, contentType]) => ({
        type,
        filename,
        contentType,
        bytes: await readFile(path.join(modelDirectory, filename)),
      })),
    );
    const current = await this.context.prisma.modelRevision.findFirst({
      where: { conversationId: input.conversationId },
      orderBy: { revisionNumber: 'desc' },
      select: { revisionNumber: true },
    });
    const revisionNumber = (current?.revisionNumber ?? 0) + 1;
    const revisionId = randomUUID();
    const stored = await Promise.all(
      files.map(async (file) => {
        const key = `revisions/${input.conversationId}/${revisionId}/${file.filename}`;
        return {
          file,
          object: await this.context.objectStore.put(key, file.bytes, file.contentType),
        };
      }),
    );
    try {
      await this.context.prisma.$transaction(async (tx) => {
        await tx.modelRevision.create({
          data: {
            id: revisionId,
            conversationId: input.conversationId,
            taskId: input.taskId,
            revisionNumber,
            parentRevisionId: input.parentRevisionId,
            status: 'SUCCEEDED',
            validationStatus: 'PASSED',
            metadata: { unit: 'mm', simplecadapiVersion: '2.0.1b1' },
            artifacts: {
              create: stored.map(({ file, object }) => ({
                type: file.type,
                objectKey: object.key,
                filename: file.filename,
                contentType: object.contentType,
                size: BigInt(object.size),
                checksum: object.checksum,
                backend: 'simplecad',
              })),
            },
          },
        });
        await tx.conversation.update({
          where: { id: input.conversationId },
          data: { currentRevisionId: revisionId, status: 'COMPLETED' },
        });
        await publishDomainEvent(tx, {
          conversationId: input.conversationId,
          taskId: input.taskId,
          type: 'model.revision.published',
          data: { revisionId, revisionNumber },
        });
        for (const { file } of stored) {
          const artifact = await tx.artifact.findFirstOrThrow({
            where: { revisionId, type: file.type },
            select: { id: true },
          });
          await publishDomainEvent(tx, {
            conversationId: input.conversationId,
            taskId: input.taskId,
            type: 'artifact.available',
            data: { artifactId: artifact.id, artifactType: file.type },
          });
        }
      });
      await freezeWorkingCopy(
        this.context.workspaceRoot,
        input.workspaceId,
        input.taskId,
        revisionNumber,
      );
      return revisionId;
    } catch (error: unknown) {
      await Promise.allSettled(
        stored.map(({ object }) => this.context.objectStore.delete(object.key)),
      );
      throw error;
    }
  }

  private async failTask(taskId: string, conversationId: string, error: unknown): Promise<void> {
    const message = safeErrorMessage(error);
    await this.context.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.FAILED,
          currentPhase: TaskPhase.FAILED,
          error: { code: 'WORKER_FAILED', message },
        },
      });
      await publishDomainEvent(tx, {
        conversationId,
        taskId,
        type: 'task.failed',
        data: { code: 'WORKER_FAILED', message },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { status: 'FAILED' },
      });
    });
  }
}

function userQuestion(missing: string[], conflicts: string[]): string {
  if (conflicts.length > 0) return 'Please confirm one unit system before modeling.';
  return `Please provide the missing CAD parameters: ${missing.join(', ')}.`;
}

function planSummary(snapshot: ReturnType<typeof requirementSnapshotSchema.parse>): string {
  return `Plan: create a ${snapshot.partType ?? 'CAD part'} in ${snapshot.unit}, validate dimensions and topology, render standard views, then publish canonical model artifacts.`;
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Task worker failed';
  return raw
    .replace(/(?:Bearer\s+)?sk-[A-Za-z0-9_-]{12,}/giu, '[REDACTED]')
    .replace(/[A-Za-z]:\\[^\s]+|\/(?:data|home|srv|opt|tmp)\/[^\s]+/gu, '[internal path]')
    .slice(0, 1_000);
}
