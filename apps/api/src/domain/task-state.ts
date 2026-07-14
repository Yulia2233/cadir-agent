import { TaskPhase, TaskStatus } from '@prisma/client';
import { AppError } from '../lib/errors.js';

const phaseTransitions: Readonly<Record<TaskPhase, readonly TaskPhase[]>> = {
  DOMAIN_GUARD: [TaskPhase.ANALYZE, TaskPhase.REJECTED, TaskPhase.FAILED],
  ANALYZE: [TaskPhase.WAITING_USER, TaskPhase.RETRIEVE, TaskPhase.FAILED],
  WAITING_USER: [TaskPhase.ANALYZE, TaskPhase.FAILED],
  RETRIEVE: [TaskPhase.PLAN, TaskPhase.FAILED],
  PLAN: [TaskPhase.CODE, TaskPhase.COMPLETED, TaskPhase.FAILED],
  CODE: [TaskPhase.EXECUTE, TaskPhase.NEEDS_USER, TaskPhase.FAILED],
  EXECUTE: [TaskPhase.VALIDATE, TaskPhase.CODE, TaskPhase.NEEDS_USER, TaskPhase.FAILED],
  VALIDATE: [TaskPhase.CODE, TaskPhase.VISUAL_REVIEW, TaskPhase.NEEDS_USER, TaskPhase.FAILED],
  VISUAL_REVIEW: [TaskPhase.CODE, TaskPhase.PUBLISH, TaskPhase.NEEDS_USER, TaskPhase.FAILED],
  PUBLISH: [TaskPhase.CASE_PACKAGE, TaskPhase.FAILED],
  CASE_PACKAGE: [TaskPhase.CASE_CANDIDATE, TaskPhase.FAILED],
  CASE_CANDIDATE: [TaskPhase.COMPLETED, TaskPhase.FAILED],
  REJECTED: [],
  NEEDS_USER: [TaskPhase.ANALYZE, TaskPhase.CODE, TaskPhase.FAILED],
  FAILED: [],
  COMPLETED: [],
};

const terminalPhases = new Set<TaskPhase>([
  TaskPhase.REJECTED,
  TaskPhase.FAILED,
  TaskPhase.COMPLETED,
]);

export function assertPhaseTransition(from: TaskPhase, to: TaskPhase): void {
  if (!phaseTransitions[from].includes(to)) {
    throw new AppError(409, 'INVALID_TASK_TRANSITION', `Cannot move task from ${from} to ${to}`);
  }
}

export function statusForPhase(phase: TaskPhase): TaskStatus {
  if (phase === TaskPhase.WAITING_USER) return TaskStatus.WAITING_USER;
  if (phase === TaskPhase.NEEDS_USER) return TaskStatus.NEEDS_USER;
  if (phase === TaskPhase.FAILED) return TaskStatus.FAILED;
  if (phase === TaskPhase.COMPLETED || phase === TaskPhase.REJECTED) return TaskStatus.COMPLETED;
  return TaskStatus.RUNNING;
}

export function isTerminalPhase(phase: TaskPhase): boolean {
  return terminalPhases.has(phase);
}
