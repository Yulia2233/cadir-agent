import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('task worker workflow contract', () => {
  it('loads the mandatory Skill before writing Model/model.py', async () => {
    const source = await readFile(
      new URL('../src/services/task-worker.ts', import.meta.url),
      'utf8',
    );
    const skillLoad = source.indexOf('await this.loadRequiredSkill');
    const codePhase = source.indexOf('TaskPhase.PLAN, TaskPhase.CODE');
    const modelWrite = source.indexOf("mode: 'BUILD'");

    expect(skillLoad).toBeGreaterThan(-1);
    expect(skillLoad).toBeLessThan(codePhase);
    expect(codePhase).toBeLessThan(modelWrite);
    expect(source).not.toContain('const source = `from pathlib');
  });

  it('uses only the canonical modeling entry and required core exports', async () => {
    const source = await readFile(
      new URL('../src/services/task-worker.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("'Model'");
    expect(source).toContain("'model.py'");
    expect(source).toContain('GraphSession');
    expect(source).toContain('export_model_json');
    expect(source).toContain('export_step');
    expect(source).toContain('export_stl');
    expect(source).toContain('Path(__file__).resolve().parent');
    expect(source).toContain('model_dir / "model.json"');
    expect(source).toContain('model_dir / "model.step"');
    expect(source).toContain('model_dir / "model.stl"');
    expect(source).toContain('makeWorkingCopyWritable(modelDirectory)');
  });

  it('publishes a revision only after execution and strict inspection', async () => {
    const source = await readFile(
      new URL('../src/services/task-worker.ts', import.meta.url),
      'utf8',
    );
    const processBody = source.slice(
      source.indexOf('public async process'),
      source.indexOf('private async move'),
    );
    const execute = processBody.indexOf("'/internal/execute'");
    const inspect = processBody.indexOf('await this.validateModel');
    const derive = processBody.indexOf('await this.deriveArtifacts');
    const publish = processBody.indexOf('await this.publishRevision');

    expect(execute).toBeGreaterThan(-1);
    expect(execute).toBeLessThan(inspect);
    expect(inspect).toBeLessThan(derive);
    expect(derive).toBeLessThan(publish);
    expect(source).toContain("'/internal/inspect'");
    expect(source).toContain("'/internal/derive'");
  });

  it('requires the complete revision artifact package before publish', async () => {
    const source = await readFile(
      new URL('../src/services/task-worker.ts', import.meta.url),
      'utf8',
    );
    for (const artifact of [
      'PREVIEW_ISO',
      'PREVIEW_FRONT',
      'PREVIEW_BACK',
      'PREVIEW_LEFT',
      'PREVIEW_RIGHT',
      'PREVIEW_TOP',
      'PREVIEW_BOTTOM',
      'GLB',
      'TOPOLOGY_MAP',
      'BREP_EDGES',
      'BREP',
    ]) {
      expect(source).toContain(`'${artifact}'`);
    }
  });

  it('returns structured failures to CODE and stops at NEEDS_USER', async () => {
    const source = await readFile(
      new URL('../src/services/task-worker.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('decideRepair(runAttempt, this.context.maxAutoIterations)');
    expect(source).toContain('recordAttempt');
    expect(source).toContain('phase, TaskPhase.CODE');
    expect(source).toContain('TaskPhase.NEEDS_USER');
    expect(source).toContain('iterationCount: iteration');
    expect(source).toContain('await this.assertTaskActive(task.id)');
    expect(source).toContain('isRepairableCadError(error)');
    expect(source).toContain('writeAttemptHistory');
    expect(source).toContain('previousCodeChecksum');
    expect(source).toContain('const attemptOffset = task.iterationCount');
    expect(source).toContain('const iteration = attemptOffset + runAttempt');
    expect(source).toContain('decideRepair(runAttempt, this.context.maxAutoIterations)');
  });

  it('uses a stable internal model alias that the authenticated proxy replaces', async () => {
    const source = await readFile(
      new URL('../src/services/task-worker.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("const INTERNAL_PROVIDER_MODEL_ALIAS = '5.6-sol'");
    expect(source).toContain('modelId: INTERNAL_PROVIDER_MODEL_ALIAS');
  });
});
