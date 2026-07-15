import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TaskMode, TaskPhase, TaskStatus, type PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { Worker } from 'bullmq';
import { requirementSnapshotSchema } from '@cadir/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { CAD_AGENT_SYSTEM_PROMPT, type OpenCodeClient } from '@cadir/opencode-adapter';
import { publishDomainEvent } from './events.js';
import { ConversationTaskLock } from './task-lock.js';
import { transitionTask } from './task-state.js';
import type { ObjectStore } from './object-store.js';
import { freezeWorkingCopy, makeWorkingCopyWritable } from './workspaces.js';
import { writeAttemptHistory } from './attempt-history.js';
import {
  decideRepair,
  isRepairableCadError,
  RepairableCadError,
  repairEvidence,
} from './repair-policy.js';
import { CAD_TASK_QUEUE, type CadTaskJobData } from './task-queue.js';

type WorkerContext = {
  prisma: PrismaClient;
  redis: Redis;
  logger: FastifyBaseLogger;
  runnerUrl: string;
  workspaceRoot: string;
  skillVersion: string;
  objectStore: ObjectStore;
  opencode: OpenCodeClient;
  maxAutoIterations: number;
};

// OpenCode uses a stable internal alias. The CADIR proxy replaces it with the
// authenticated user's current model ID at the outbound provider boundary.
const INTERNAL_PROVIDER_MODEL_ALIAS = '5.6-sol';

export class TaskWorker {
  #worker: Worker<CadTaskJobData> | null = null;

  public constructor(private readonly context: WorkerContext) {}

  public start(): void {
    if (this.#worker !== null) return;
    this.#worker = new Worker<CadTaskJobData>(
      CAD_TASK_QUEUE,
      async (job) => this.process(job.data.taskId),
      {
        connection: this.context.redis,
        concurrency: 4,
        lockDuration: 10 * 60 * 1_000,
        maxStalledCount: 2,
        removeOnComplete: { age: 24 * 60 * 60, count: 5_000 },
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 10_000 },
      },
    );
    this.#worker.on('error', (error) => {
      this.context.logger.error({ errorType: error.name }, 'CAD task queue worker error');
    });
    this.#worker.on('failed', (job, error) => {
      this.context.logger.error(
        { jobId: job?.id, taskId: job?.data.taskId, errorType: error.name },
        'CAD task queue job failed',
      );
    });
  }

  public async stop(): Promise<void> {
    await this.#worker?.close();
    this.#worker = null;
    this.context.redis.disconnect(false);
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
        throw new Error('Conversation write lease is busy; retry the queued job');
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
        const requestMessage = await this.context.prisma.message.findFirstOrThrow({
          where: { taskId: task.id, role: 'USER' },
          orderBy: { createdAt: 'desc' },
          select: { content: true },
        });
        const generated = await this.context.opencode.prompt({
          sessionId: task.conversation.opencodeSessionId,
          directory: task.workspace.storagePath,
          mode: 'PLAN',
          content: buildPlanPrompt(task.conversationId, task.id, requestMessage.content, snapshot),
          system: CAD_AGENT_SYSTEM_PROMPT,
          provider: { providerId: 'cadir-provider', modelId: INTERNAL_PROVIDER_MODEL_ALIAS },
        });
        const message = await this.context.prisma.message.create({
          data: {
            conversationId: task.conversationId,
            taskId: task.id,
            role: 'AGENT',
            content: assistantText(generated.parts) ?? planSummary(snapshot),
            opencodeMessageId: generated.messageId,
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
      const modelPath = await this.prepareWorkingCopy(
        task.workspaceId,
        task.id,
        snapshot,
        task.conversation.currentRevisionId,
      );
      const requestMessage = await this.context.prisma.message.findFirstOrThrow({
        where: { taskId: task.id, role: 'USER' },
        orderBy: { createdAt: 'desc' },
        select: { content: true },
      });
      const revisionId = randomUUID();
      let repairEvidenceText: string | null = null;
      let previousCodeChecksum: string | null = null;
      let workflowSucceeded = false;
      // A NEEDS_USER task can be resumed. Keep attempt directory numbers
      // monotonic across resumptions so immutable evidence is never overwritten.
      const attemptOffset = task.iterationCount;
      for (let runAttempt = 1; runAttempt <= this.context.maxAutoIterations; runAttempt += 1) {
        const iteration = attemptOffset + runAttempt;
        await this.assertTaskActive(task.id);
        await this.context.prisma.task.update({
          where: { id: task.id },
          data: { iterationCount: iteration },
        });
        let phase: TaskPhase = TaskPhase.CODE;
        try {
          const generated = await this.context.opencode.prompt({
            sessionId: task.conversation.opencodeSessionId,
            directory: task.workspace.storagePath,
            mode: 'BUILD',
            content: buildModelPrompt(
              task.conversationId,
              task.id,
              requestMessage.content,
              snapshot,
              repairEvidenceText,
            ),
            system: CAD_AGENT_SYSTEM_PROMPT,
            provider: { providerId: 'cadir-provider', modelId: INTERNAL_PROVIDER_MODEL_ALIAS },
          });
          await this.context.prisma.message.updateMany({
            where: { taskId: task.id, role: 'USER', opencodeMessageId: null },
            data: { opencodeMessageId: generated.messageId },
          });
          await readFile(modelPath, 'utf8').catch(() => {
            throw new RepairableCadError(
              'MODEL_NOT_WRITTEN',
              'OpenCode completed without writing Model/model.py',
            );
          });
          await this.move(task.id, task.conversationId, TaskPhase.CODE, TaskPhase.EXECUTE);
          phase = TaskPhase.EXECUTE;
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
              (await response.json()) as {
                status: string;
                exit_code: number | null;
                stderr: string;
              },
          );
          if (execution.status !== 'succeeded') {
            if (execution.status === 'rejected') {
              throw new Error(
                `Runner rejected unsafe or invalid model code: ${execution.stderr.slice(0, 500)}`,
              );
            }
            throw new RepairableCadError(
              `MODEL_EXECUTION_${execution.status.toUpperCase()}`,
              `Model execution ${execution.status}: ${execution.stderr.slice(0, 500)}`,
            );
          }
          await this.move(task.id, task.conversationId, TaskPhase.EXECUTE, TaskPhase.VALIDATE);
          phase = TaskPhase.VALIDATE;
          await this.validateModel(task.workspaceId, task.id, snapshot);
          await this.move(
            task.id,
            task.conversationId,
            TaskPhase.VALIDATE,
            TaskPhase.VISUAL_REVIEW,
          );
          phase = TaskPhase.VISUAL_REVIEW;
          await this.deriveArtifacts(task.workspaceId, task.conversationId, task.id, revisionId);
          previousCodeChecksum = await this.recordAttempt({
            workspaceId: task.workspaceId,
            taskId: task.id,
            modelPath,
            phase,
            iteration,
            outcome: 'passed',
            failureCode: null,
            evidence: null,
            previousCodeChecksum,
          });
          workflowSucceeded = true;
          break;
        } catch (error: unknown) {
          const evidence = repairEvidence(error);
          const failureCode =
            error instanceof RepairableCadError ? error.code : 'NON_REPAIRABLE_FAILURE';
          previousCodeChecksum = await this.recordAttempt({
            workspaceId: task.workspaceId,
            taskId: task.id,
            modelPath,
            phase,
            iteration,
            outcome: 'failed',
            failureCode,
            evidence,
            previousCodeChecksum,
          });
          if (!isRepairableCadError(error)) throw error;
          repairEvidenceText = evidence;
          if (decideRepair(runAttempt, this.context.maxAutoIterations) === 'needs_user') {
            await this.requestRepairInput(task.id, task.conversationId, phase, repairEvidenceText);
            return;
          }
          if (phase !== TaskPhase.CODE) {
            await this.move(task.id, task.conversationId, phase, TaskPhase.CODE);
          }
        }
      }
      if (!workflowSucceeded) throw new Error('CAD repair loop ended without a result');
      await this.assertTaskActive(task.id);
      await this.move(task.id, task.conversationId, TaskPhase.VISUAL_REVIEW, TaskPhase.PUBLISH);
      await this.publishRevision({
        revisionId,
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

  private async prepareWorkingCopy(
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
    await makeWorkingCopyWritable(modelDirectory);
    const modelPath = path.join(modelDirectory, 'model.py');
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
    if (!response.ok) {
      if (response.status >= 500) throw new Error('Geometry inspection service is unavailable');
      throw new RepairableCadError('STRICT_REPLAY_FAILED', 'Strict model inspection failed');
    }
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
    if (!validation.passed) {
      throw new RepairableCadError(
        'GEOMETRY_VALIDATION_FAILED',
        'Model geometry did not satisfy the requirement snapshot',
      );
    }
    await writeFile(
      path.join(workspacePath, 'Model', 'validation.json'),
      JSON.stringify(validation, null, 2),
      'utf8',
    );
  }

  private async publishRevision(input: {
    revisionId: string;
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
      ['PREVIEW_ISO', 'previews/iso.png', 'image/png'],
      ['PREVIEW_FRONT', 'previews/front.png', 'image/png'],
      ['PREVIEW_BACK', 'previews/back.png', 'image/png'],
      ['PREVIEW_LEFT', 'previews/left.png', 'image/png'],
      ['PREVIEW_RIGHT', 'previews/right.png', 'image/png'],
      ['PREVIEW_TOP', 'previews/top.png', 'image/png'],
      ['PREVIEW_BOTTOM', 'previews/bottom.png', 'image/png'],
      ['GLB', 'viewer/model.glb', 'model/gltf-binary'],
      ['TOPOLOGY_MAP', 'viewer/topology-map.json', 'application/json'],
      ['BREP_EDGES', 'viewer/edges.bin', 'application/octet-stream'],
      ['BREP', 'viewer/model.brep', 'application/octet-stream'],
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
    const revisionId = input.revisionId;
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

  private async deriveArtifacts(
    workspaceId: string,
    conversationId: string,
    taskId: string,
    revisionId: string,
  ): Promise<void> {
    const workspacePath = path.join(this.context.workspaceRoot, workspaceId, 'working', taskId);
    await publishDomainEvent(this.context.prisma, {
      conversationId,
      taskId,
      type: 'model.render.started',
      data: { views: ['iso', 'front', 'back', 'left', 'right', 'top', 'bottom'] },
    });
    const response = await fetch(new URL('/internal/derive', this.context.runnerUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspace_path: workspacePath,
        revision_id: revisionId,
        image_width: 960,
        image_height: 720,
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      if (response.status >= 500) throw new Error('Model derivation service is unavailable');
      throw new RepairableCadError(
        'VISUAL_DERIVATION_FAILED',
        'Model preview and topology derivation failed',
      );
    }
    const result = (await response.json()) as {
      generated?: string[];
      face_count?: number;
      edge_count?: number;
      triangle_count?: number;
    };
    const expected = new Set([
      'previews/iso.png',
      'previews/front.png',
      'previews/back.png',
      'previews/left.png',
      'previews/right.png',
      'previews/top.png',
      'previews/bottom.png',
      'viewer/model.glb',
      'viewer/topology-map.json',
      'viewer/edges.bin',
      'viewer/model.brep',
    ]);
    for (const generated of result.generated ?? []) expected.delete(generated);
    if (
      expected.size > 0 ||
      (result.face_count ?? 0) <= 0 ||
      (result.edge_count ?? 0) <= 0 ||
      (result.triangle_count ?? 0) <= 0
    ) {
      throw new RepairableCadError(
        'DERIVED_ARTIFACTS_INCOMPLETE',
        'Derived artifact set is incomplete',
      );
    }
  }

  private async assertTaskActive(taskId: string): Promise<void> {
    const task = await this.context.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { status: true, abortedAt: true },
    });
    if (
      task.abortedAt !== null ||
      task.status === TaskStatus.ABORTING ||
      task.status === TaskStatus.ABORTED
    ) {
      throw new TaskAbortedError();
    }
  }

  private async recordAttempt(input: {
    workspaceId: string;
    taskId: string;
    modelPath: string;
    phase: TaskPhase;
    iteration: number;
    outcome: 'passed' | 'failed';
    failureCode: string | null;
    evidence: string | null;
    previousCodeChecksum: string | null;
  }): Promise<string | null> {
    const metadata = await writeAttemptHistory({
      workspaceRoot: this.context.workspaceRoot,
      ...input,
    });
    await this.context.prisma.auditLog.create({
      data: {
        action: 'task.repair.attempt',
        resourceType: 'task',
        resourceId: input.taskId,
        traceId: input.taskId,
        details: metadata,
      },
    });
    return metadata.codeChecksum;
  }

  private async requestRepairInput(
    taskId: string,
    conversationId: string,
    from: TaskPhase,
    evidence: string,
  ): Promise<void> {
    await this.context.prisma.$transaction(async (tx) => {
      await transitionTask(tx, { taskId, conversationId, from, to: TaskPhase.NEEDS_USER });
      const message = await tx.message.create({
        data: {
          conversationId,
          taskId,
          role: 'AGENT',
          content: `The model could not be repaired automatically. Please clarify the requirement or constraints. Last validation evidence: ${evidence}`,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { status: 'WAITING_USER' },
      });
      await publishDomainEvent(tx, {
        conversationId,
        taskId,
        type: 'agent.message.completed',
        data: { messageId: message.id },
      });
    });
  }

  private async failTask(taskId: string, conversationId: string, error: unknown): Promise<void> {
    if (error instanceof TaskAbortedError) {
      await this.context.prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: taskId },
          data: { status: TaskStatus.ABORTED, abortedAt: new Date() },
        });
        await publishDomainEvent(tx, {
          conversationId,
          taskId,
          type: 'task.aborted',
          data: { taskId },
        });
        await tx.conversation.update({
          where: { id: conversationId },
          data: { status: 'IDLE' },
        });
      });
      return;
    }
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

class TaskAbortedError extends Error {
  public constructor() {
    super('Task was aborted');
    this.name = 'TaskAbortedError';
  }
}

function userQuestion(missing: string[], conflicts: string[]): string {
  if (conflicts.length > 0) return 'Please confirm one unit system before modeling.';
  return `Please provide the missing CAD parameters: ${missing.join(', ')}.`;
}

function planSummary(snapshot: ReturnType<typeof requirementSnapshotSchema.parse>): string {
  return `Plan: create a ${snapshot.partType ?? 'CAD part'} in ${snapshot.unit}, validate dimensions and topology, render standard views, then publish canonical model artifacts.`;
}

function buildPlanPrompt(
  conversationId: string,
  taskId: string,
  request: string,
  snapshot: ReturnType<typeof requirementSnapshotSchema.parse>,
): string {
  return [
    `CADIR conversation ID: ${conversationId}`,
    `CADIR task ID: ${taskId}`,
    `User CAD request: ${request}`,
    `Requirement snapshot: ${JSON.stringify(snapshot)}`,
    'Load the SimpleCADAPI Skill and relevant public docs, then provide a concise modeling and validation plan.',
    'Plan mode is read-only. Do not write files or execute the model.',
  ].join('\n');
}

function assistantText(parts: unknown[]): string | null {
  const text = parts
    .flatMap((part) => {
      if (typeof part !== 'object' || part === null) return [];
      const value = (part as { text?: unknown }).text;
      return typeof value === 'string' ? [value] : [];
    })
    .join('')
    .trim();
  return text.length > 0 ? text.slice(0, 40_000) : null;
}

function buildModelPrompt(
  conversationId: string,
  taskId: string,
  request: string,
  snapshot: ReturnType<typeof requirementSnapshotSchema.parse>,
  evidence: string | null,
): string {
  return [
    `CADIR conversation ID: ${conversationId}`,
    `CADIR task ID: ${taskId}`,
    `User CAD request: ${request}`,
    `Validated requirement snapshot: ${JSON.stringify(snapshot)}`,
    ...(evidence === null
      ? []
      : [
          `The previous attempt failed. Use this bounded validation evidence to repair the model: ${evidence}`,
        ]),
    'Load SKILL.md and the API index first, then every exact API and core type page you use.',
    'Use only the CADIR tools. Write the complete implementation with write_model, execute it, inspect it, and repair failures.',
    'The sole entry is Model/model.py. It must use GraphSession and export canonical model.json, STEP, and STL with fixed names.',
    'Inside model.py set model_dir = Path(__file__).resolve().parent. Persist export_model_json(session) with (model_dir / "model.json").write_text(model_json, encoding="utf-8"). Call export_step(result, str(model_dir / "model.step")) and export_stl(result, str(model_dir / "model.stl")).',
    'All three exports must be non-empty under Model/. Do not write model.json, model.step, or model.stl in the Working Copy root.',
    'Do not stop after explaining or planning. Finish by executing and checking the model.',
  ].join('\n');
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Task worker failed';
  return raw
    .replace(/(?:Bearer\s+)?sk-[A-Za-z0-9_-]{12,}/giu, '[REDACTED]')
    .replace(/[A-Za-z]:\\[^\s]+|\/(?:data|home|srv|opt|tmp)\/[^\s]+/gu, '[internal path]')
    .slice(0, 1_000);
}
