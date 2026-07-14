import { describe, expect, it } from 'vitest';
import {
  findTopologyEntity,
  parseTopologyMap,
  resolveTopologyEntity,
} from '../src/services/topology.js';

const revisionId = '123e4567-e89b-42d3-a456-426614174000';
const map = parseTopologyMap(
  {
    version: '1',
    revisionId,
    unit: 'mm',
    faces: [
      {
        displayId: 'F1',
        topologyRef: 'face_1',
        tags: ['role.mounting_surface'],
        signature: { geometryType: 'plane', area: 800 },
        adjacentTopologyRefs: ['edge_1'],
        triangleStart: 0,
        triangleCount: 2,
      },
    ],
    edges: [
      {
        displayId: 'E1',
        topologyRef: 'edge_1',
        tags: [],
        signature: { geometryType: 'line', length: 40 },
        adjacentTopologyRefs: ['face_1'],
        polylineStart: 0,
        polylineCount: 2,
      },
    ],
  },
  revisionId,
);
const firstFace = map.faces[0]!;

describe('topology mapping', () => {
  it('finds an exact entity within the requested revision', () => {
    expect(findTopologyEntity(map, 'face', 'face_1').displayId).toBe('F1');
  });

  it('rejects a topology map from another revision', () => {
    expect(() =>
      parseTopologyMap({ ...map, revisionId: '123e4567-e89b-42d3-a456-426614174001' }, revisionId),
    ).toThrow('another revision');
  });

  it('rejects overlapping triangle ranges', () => {
    expect(() =>
      parseTopologyMap(
        {
          ...map,
          faces: [
            ...map.faces,
            { ...firstFace, topologyRef: 'face_2', displayId: 'F2', triangleStart: 1 },
          ],
        },
        revisionId,
      ),
    ).toThrow('overlap');
  });

  it('relocates by a unique semantic tag before geometry signature', () => {
    const old = findTopologyEntity(map, 'face', 'face_1');
    const result = resolveTopologyEntity(
      old,
      { ...map, faces: [{ ...firstFace, topologyRef: 'face_new', displayId: 'F8' }] },
      'face',
    );
    expect(result.status).toBe('RECOVERED');
    expect(result.entity?.topologyRef).toBe('face_new');
  });

  it('never relocates by display index alone', () => {
    const old = findTopologyEntity(map, 'face', 'face_1');
    const result = resolveTopologyEntity(
      old,
      {
        ...map,
        faces: [
          {
            ...firstFace,
            topologyRef: 'other',
            tags: [],
            signature: { ...firstFace.signature, geometryType: 'plane', area: 900 },
          },
        ],
      },
      'face',
    );
    expect(result.status).toBe('INVALID');
  });
});
