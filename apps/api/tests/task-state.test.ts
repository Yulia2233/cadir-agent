import { TaskPhase, TaskStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { assertPhaseTransition, statusForPhase } from '../src/domain/task-state.js';

describe('task state machine', () => {
  it('accepts the normal modeling path', () => {
    expect(() => assertPhaseTransition(TaskPhase.DOMAIN_GUARD, TaskPhase.ANALYZE)).not.toThrow();
    expect(() => assertPhaseTransition(TaskPhase.VALIDATE, TaskPhase.VISUAL_REVIEW)).not.toThrow();
  });

  it('rejects skipped phases', () => {
    expect(() => assertPhaseTransition(TaskPhase.DOMAIN_GUARD, TaskPhase.CODE)).toThrow(
      /Cannot move task/,
    );
  });

  it('maps user and terminal phases to durable status', () => {
    expect(statusForPhase(TaskPhase.WAITING_USER)).toBe(TaskStatus.WAITING_USER);
    expect(statusForPhase(TaskPhase.COMPLETED)).toBe(TaskStatus.COMPLETED);
  });
});
