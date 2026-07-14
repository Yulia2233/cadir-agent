import { describe, expect, it } from 'vitest';
import { assertToolAllowed, mapOpenCodeEvent } from '../src/index.js';

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
});
