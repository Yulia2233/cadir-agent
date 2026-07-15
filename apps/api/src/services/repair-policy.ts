export type RepairDecision = 'retry' | 'needs_user';

export class RepairableCadError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RepairableCadError';
  }
}

export function isRepairableCadError(error: unknown): error is RepairableCadError {
  return error instanceof RepairableCadError;
}

export function decideRepair(iteration: number, maxIterations: number): RepairDecision {
  if (!Number.isInteger(iteration) || iteration < 1) {
    throw new RangeError('iteration must be a positive integer');
  }
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new RangeError('maxIterations must be a positive integer');
  }
  return iteration < maxIterations ? 'retry' : 'needs_user';
}

export function repairEvidence(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'The CAD stage failed';
  return raw
    .replace(/(?:Bearer\s+)?sk-[A-Za-z0-9_-]{12,}/giu, '[REDACTED]')
    .replace(/[A-Za-z]:\\[^\s]+|\/(?:data|home|srv|opt|tmp)\/[^\s]+/gu, '[internal path]')
    .slice(0, 2_000);
}
