import { describe, expect, it } from 'vitest';
import { extractRequirementSnapshot } from '../src/domain/requirement-snapshot.js';

describe('requirement snapshots', () => {
  it('extracts Chinese plate dimensions and default units', () => {
    const snapshot = extractRequirementSnapshot({
      content: '做一个长100宽50厚5毫米的安装板',
      freecadRequested: false,
    });
    expect(snapshot.partType).toBe('mounting plate');
    expect(snapshot.dimensions).toEqual({ length: 100, width: 50, thickness: 5 });
    expect(snapshot.missing).toEqual([]);
  });

  it('detects missing plate dimensions', () => {
    const snapshot = extractRequirementSnapshot({
      content: '做一个安装板',
      freecadRequested: false,
    });
    expect(snapshot.missing).toEqual(['length', 'width', 'thickness']);
  });

  it('merges a user supplement without losing confirmed requirements', () => {
    const initial = extractRequirementSnapshot({
      content: 'Create a mounting plate length 100 width 50 mm',
      freecadRequested: false,
    });
    const updated = extractRequirementSnapshot({
      content: 'thickness 8 mm and add four holes',
      freecadRequested: true,
      previous: initial,
    });
    expect(updated.dimensions).toEqual({ length: 100, width: 50, thickness: 8 });
    expect(updated.features).toContain('hole');
    expect(updated.freecadRequested).toBe(true);
  });

  it('flags mixed units for confirmation', () => {
    const snapshot = extractRequirementSnapshot({
      content: 'Create a plate length 4 in width 50 mm thickness 5 mm',
      freecadRequested: false,
    });
    expect(snapshot.conflicts).toContain('mixed_units_require_confirmation');
  });
});
