import { requirementSnapshotSchema, type Selection } from '@cadir/contracts';

const dimensionPatterns: Array<[string, RegExp]> = [
  ['length', /(?:length|long|长)\s*[:=]?\s*(\d+(?:\.\d+)?)/iu],
  ['width', /(?:width|wide|宽)\s*[:=]?\s*(\d+(?:\.\d+)?)/iu],
  ['thickness', /(?:thickness|thick|厚)\s*[:=]?\s*(\d+(?:\.\d+)?)/iu],
  ['diameter', /(?:diameter|dia|直径|孔径)\s*[:=]?\s*(\d+(?:\.\d+)?)/iu],
];

function detectUnit(content: string): 'mm' | 'cm' | 'm' | 'in' {
  if (/(?:inch|inches|英寸|\bin\b)/iu.test(content)) return 'in';
  if (/(?:厘米|\bcm\b)/iu.test(content)) return 'cm';
  if (/(?:米|\bm\b)/iu.test(content) && !/(?:毫米|\bmm\b)/iu.test(content)) return 'm';
  return 'mm';
}

function detectPartType(content: string): string | null {
  const types: Array<[string, RegExp]> = [
    ['mounting plate', /(?:mounting\s+plate|安装板|板)/iu],
    ['flange', /(?:flange|法兰)/iu],
    ['bracket', /(?:bracket|支架)/iu],
  ];
  return types.find(([, pattern]) => pattern.test(content))?.[0] ?? null;
}

function parseCompactDimensions(content: string): Record<string, number> {
  const compact = content.match(
    /(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)/iu,
  );
  if (compact === null) return {};
  return { length: Number(compact[1]), width: Number(compact[2]), thickness: Number(compact[3]) };
}

export function extractRequirementSnapshot(input: {
  content: string;
  freecadRequested: boolean;
  selectionIds?: string[];
  attachmentIds?: string[];
  parentRevisionId?: string | null;
  previous?: unknown;
}) {
  const previousResult = requirementSnapshotSchema.safeParse(input.previous);
  const previous = previousResult.success ? previousResult.data : null;
  const dimensions = { ...(previous?.dimensions ?? {}), ...parseCompactDimensions(input.content) };
  for (const [name, pattern] of dimensionPatterns) {
    const match = input.content.match(pattern);
    if (match?.[1] !== undefined) dimensions[name] = Number(match[1]);
  }

  const features = new Set(previous?.features ?? []);
  if (/(?:hole|孔)/iu.test(input.content)) features.add('hole');
  if (/(?:fillet|圆角)/iu.test(input.content)) features.add('fillet');
  if (/(?:chamfer|倒角)/iu.test(input.content)) features.add('chamfer');

  const partType = detectPartType(input.content) ?? previous?.partType ?? null;
  const missing: string[] = [];
  if (partType === null) missing.push('partType');
  if (partType === 'mounting plate') {
    for (const dimension of ['length', 'width', 'thickness']) {
      if (dimensions[dimension] === undefined) missing.push(dimension);
    }
  }

  const units = new Set<string>();
  if (/(?:毫米|\bmm\b)/iu.test(input.content)) units.add('mm');
  if (/(?:厘米|\bcm\b)/iu.test(input.content)) units.add('cm');
  if (/(?:inch|inches|英寸|\bin\b)/iu.test(input.content)) units.add('in');
  const conflicts = units.size > 1 ? ['mixed_units_require_confirmation'] : [];

  return requirementSnapshotSchema.parse({
    version: (previous?.version ?? 0) + 1,
    partType,
    unit: detectUnit(input.content),
    dimensions,
    features: [...features],
    constraints: previous?.constraints ?? [],
    solidCount: previous?.solidCount ?? 1,
    freecadRequested: input.freecadRequested,
    selectionIds: input.selectionIds ?? [],
    attachmentIds: input.attachmentIds ?? [],
    parentRevisionId: input.parentRevisionId ?? null,
    missing,
    conflicts,
  });
}

export function selectionContext(selection: Selection) {
  return {
    revisionId: selection.revisionId,
    entityType: selection.entityType,
    topologyRef: selection.topologyRef,
    displayId: selection.displayId,
    tags: selection.tags,
    signature: selection.signature,
    qlSelector: selection.qlSelector,
  };
}
