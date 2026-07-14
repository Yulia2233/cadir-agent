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
    const modelWrite = source.indexOf('await this.prepareModel');

    expect(skillLoad).toBeGreaterThan(-1);
    expect(skillLoad).toBeLessThan(codePhase);
    expect(codePhase).toBeLessThan(modelWrite);
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
    const publish = processBody.indexOf('await this.publishRevision');

    expect(execute).toBeGreaterThan(-1);
    expect(execute).toBeLessThan(inspect);
    expect(inspect).toBeLessThan(publish);
    expect(source).toContain("'/internal/inspect'");
  });
});
