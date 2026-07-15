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

  it('extracts a Chinese flat four-hole flange and respects negated chamfering', () => {
    const snapshot = extractRequirementSnapshot({
      content:
        '生成一个四孔法兰，不要做倒角，就一个平板。外径100毫米，厚度8毫米，中心孔直径30毫米，四个安装孔直径10毫米，孔中心均布在直径70毫米的分度圆上。',
      freecadRequested: false,
    });

    expect(snapshot.partType).toBe('flange');
    expect(snapshot.dimensions).toMatchObject({
      outerDiameter: 100,
      thickness: 8,
      centerHoleDiameter: 30,
      holeDiameter: 10,
      pitchCircleDiameter: 70,
    });
    expect(snapshot.features).toContain('hole');
    expect(snapshot.features).not.toContain('chamfer');
    expect(snapshot.missing).toEqual([]);
  });

  it('removes a previously inferred feature when a supplement explicitly negates it', () => {
    const previous = extractRequirementSnapshot({
      content: '法兰外径100毫米厚8毫米，做倒角',
      freecadRequested: false,
    });
    const updated = extractRequirementSnapshot({
      content: '不要倒角',
      freecadRequested: false,
      previous,
    });

    expect(previous.features).toContain('chamfer');
    expect(updated.features).not.toContain('chamfer');
  });
});
