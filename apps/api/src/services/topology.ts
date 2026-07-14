import { topologyMapSchema } from '@cadir/contracts';
import { AppError } from '../lib/errors.js';

export type TopologyMap = ReturnType<typeof topologyMapSchema.parse>;

export function parseTopologyMap(value: unknown, revisionId: string): TopologyMap {
  const map = topologyMapSchema.parse(value);
  if (map.revisionId !== revisionId) {
    throw new AppError(409, 'VIEWER_REVISION_MISMATCH', 'Viewer files belong to another revision');
  }
  validateNonOverlappingRanges(
    map.faces.map((face) => [face.triangleStart, face.triangleCount]),
    'triangle',
  );
  validateNonOverlappingRanges(
    map.edges.map((edge) => [edge.polylineStart, edge.polylineCount]),
    'polyline',
  );
  return map;
}

function validateNonOverlappingRanges(ranges: Array<[number, number]>, label: string): void {
  const sorted = [...ranges].sort((left, right) => left[0] - right[0]);
  let end = 0;
  for (const [start, count] of sorted) {
    if (start < end) throw new AppError(409, 'INVALID_TOPOLOGY_MAP', `${label} ranges overlap`);
    end = start + count;
  }
}

export function findTopologyEntity(map: TopologyMap, type: 'face' | 'edge', topologyRef: string) {
  const entity = (type === 'face' ? map.faces : map.edges).find(
    (candidate) => candidate.topologyRef === topologyRef,
  );
  if (entity === undefined) {
    throw new AppError(404, 'TOPOLOGY_NOT_FOUND', 'Topology reference is not in this revision');
  }
  return entity;
}

export function resolveTopologyEntity(
  oldEntity: ReturnType<typeof findTopologyEntity>,
  nextMap: TopologyMap,
  type: 'face' | 'edge',
) {
  const candidates = type === 'face' ? nextMap.faces : nextMap.edges;
  const tagMatches = candidates.filter(
    (candidate) =>
      oldEntity.tags.length > 0 && oldEntity.tags.some((tag) => candidate.tags.includes(tag)),
  );
  if (tagMatches.length === 1) return { status: 'RECOVERED' as const, entity: tagMatches[0] };
  if (tagMatches.length > 1) return { status: 'AMBIGUOUS' as const, entity: null };

  const signatureMatches = candidates.filter((candidate) => {
    if (candidate.signature.geometryType !== oldEntity.signature.geometryType) return false;
    const expected = oldEntity.signature.area ?? oldEntity.signature.length;
    const actual = candidate.signature.area ?? candidate.signature.length;
    return (
      expected !== null &&
      actual !== null &&
      Math.abs(expected - actual) <= Math.max(1e-6, expected * 1e-6)
    );
  });
  if (signatureMatches.length === 1)
    return { status: 'RECOVERED' as const, entity: signatureMatches[0] };
  if (signatureMatches.length > 1) return { status: 'AMBIGUOUS' as const, entity: null };
  return { status: 'INVALID' as const, entity: null };
}
