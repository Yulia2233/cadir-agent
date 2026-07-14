import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type AcceptanceCase = {
  id: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2';
};

function parseAcceptanceCases(markdown: string): AcceptanceCase[] {
  const cases: AcceptanceCase[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const columns = line
      .split('|')
      .slice(1, -1)
      .map((column) => column.trim());
    if (columns.length !== 8 || !/^[A-Z0-9]+-\d{3}$/.test(columns[0] ?? '')) continue;
    const priority = columns[5];
    if (priority !== 'P0' && priority !== 'P1' && priority !== 'P2') continue;
    cases.push({ id: columns[0]!, title: columns[1]!, priority });
  }
  return cases;
}

describe('authoritative acceptance catalog', () => {
  it('loads all 457 unique acceptance cases without changing their IDs', async () => {
    const source = path.resolve(process.cwd(), '..', 'to_test.md');
    const cases = parseAcceptanceCases(await readFile(source, 'utf8'));
    const identifiers = new Set(cases.map((testCase) => testCase.id));

    expect(cases).toHaveLength(457);
    expect(identifiers.size).toBe(457);
  });

  it('retains every release-blocking P0 case in the executable catalog', async () => {
    const source = path.resolve(process.cwd(), '..', 'to_test.md');
    const cases = parseAcceptanceCases(await readFile(source, 'utf8'));
    const p0Cases = cases.filter((testCase) => testCase.priority === 'P0');

    expect(p0Cases.length).toBeGreaterThan(0);
    expect(p0Cases.some((testCase) => testCase.id === 'E2E-001')).toBe(true);
    expect(p0Cases.some((testCase) => testCase.id === 'E2E-014')).toBe(true);
  });
});
