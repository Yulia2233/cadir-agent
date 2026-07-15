import { describe, expect, it } from 'vitest';
import {
  decideRepair,
  isRepairableCadError,
  RepairableCadError,
  repairEvidence,
} from '../src/services/repair-policy.js';

describe('automatic CAD repair policy', () => {
  it('retries before the configured limit and requests user input at the limit', () => {
    expect(decideRepair(1, 4)).toBe('retry');
    expect(decideRepair(3, 4)).toBe('retry');
    expect(decideRepair(4, 4)).toBe('needs_user');
  });

  it('rejects invalid policy values', () => {
    expect(() => decideRepair(0, 4)).toThrow(/positive integer/);
    expect(() => decideRepair(1, 0)).toThrow(/positive integer/);
  });

  it('redacts secrets and internal paths from repair evidence', () => {
    const evidence = repairEvidence(
      new Error('failed with sk-1234567890abcdef at /data/workspaces/private/model.py'),
    );
    expect(evidence).not.toContain('sk-1234567890abcdef');
    expect(evidence).not.toContain('/data/workspaces');
    expect(evidence).toContain('[REDACTED]');
    expect(evidence).toContain('[internal path]');
  });

  it('distinguishes model repair failures from infrastructure failures', () => {
    expect(isRepairableCadError(new RepairableCadError('GEOMETRY_FAILED', 'bad model'))).toBe(true);
    expect(isRepairableCadError(new Error('database unavailable'))).toBe(false);
  });
});
