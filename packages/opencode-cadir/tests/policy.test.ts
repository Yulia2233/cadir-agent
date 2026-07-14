import { describe, expect, it } from 'vitest';
import { assertToolAllowed, mapOpenCodeEvent, parseCadToolCall } from '../src/index.js';

describe('OpenCode CAD policy', () => {
  it('blocks write and execute tools in plan mode', () => {
    expect(() => assertToolAllowed('PLAN', 'write_model')).toThrow(/not allowed/);
    expect(() => assertToolAllowed('PLAN', 'execute_model')).toThrow(/not allowed/);
  });

  it('allows only candidate submission for the packager', () => {
    expect(assertToolAllowed('CASE_PACKAGER', 'submit_case_candidate')).toBe(
      'submit_case_candidate',
    );
    expect(() => assertToolAllowed('CASE_PACKAGER', 'get_model_case')).toThrow(/not allowed/);
  });

  it('does not expose arbitrary shell tools', () => {
    expect(() => assertToolAllowed('BUILD', 'shell')).toThrow();
  });

  it('maps supported events without leaking unknown internal events', () => {
    expect(mapOpenCodeEvent('tool.skill.started')).toBe('skill.loading');
    expect(mapOpenCodeEvent('session.reasoning.delta')).toBeNull();
  });

  it('rejects code injection in structured geometry queries', () => {
    const context = {
      conversationId: '11111111-1111-4111-8111-111111111111',
      taskId: '22222222-2222-4222-8222-222222222222',
    };
    expect(() =>
      parseCadToolCall('BUILD', 'inspect_geometry', {
        ...context,
        entity: 'face',
        index: 0,
        fields: ["__import__('os')"],
      }),
    ).toThrow();
    expect(() =>
      parseCadToolCall('PLAN', 'write_model', { ...context, source: 'print(1)' }),
    ).toThrow(/not allowed/);
  });
});
