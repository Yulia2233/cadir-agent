import { describe, expect, it } from 'vitest';
import {
  API_CONTRACT_VERSION,
  cadirEventSchema,
  eventDataSchemas,
  eventTypeSchema,
  freecadConversionSchema,
  requirementSnapshotSchema,
  restApiSchema,
  taskPhaseSchema,
  topologyMapSchema,
  viewerManifestSchema,
} from '../src/index.js';

describe('shared contracts', () => {
  it('publishes an explicit compatibility version', () => {
    expect(API_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps REST operation names and routes unique', () => {
    const operations = Object.values(restApiSchema).map((route) => `${route.method} ${route.path}`);
    expect(new Set(operations).size).toBe(operations.length);
  });

  it('defines event data for every public event type', () => {
    expect(Object.keys(eventDataSchemas).sort()).toEqual([...eventTypeSchema.options].sort());
  });

  it('accepts the requirements phase event example', () => {
    expect(
      cadirEventSchema.parse({
        event_id: 'evt_123',
        conversation_id: '123e4567-e89b-42d3-a456-426614174000',
        task_id: '123e4567-e89b-42d3-a456-426614174001',
        type: 'task.phase.changed',
        timestamp: '2026-07-14T10:00:00Z',
        sequence: 7,
        data: { phase: 'VALIDATE', label: 'Validating model', progress: null },
      }).type,
    ).toBe('task.phase.changed');
  });

  it('rejects malformed type-specific event data', () => {
    const result = cadirEventSchema.safeParse({
      event_id: 'evt_123',
      conversation_id: '123e4567-e89b-42d3-a456-426614174000',
      task_id: null,
      type: 'artifact.available',
      timestamp: '2026-07-14T10:00:00Z',
      sequence: 8,
      data: { artifactId: '../secret', artifactType: 'STEP' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields to detect incompatible envelope changes', () => {
    const result = cadirEventSchema.safeParse({
      event_id: 'evt_124',
      conversation_id: '123e4567-e89b-42d3-a456-426614174000',
      task_id: null,
      type: 'skill.loading',
      timestamp: '2026-07-14T10:00:00Z',
      sequence: 9,
      data: { name: 'simplecadapi' },
      rawModelReasoning: 'must never cross the public boundary',
    });
    expect(result.success).toBe(false);
  });

  it('keeps phase names unique and stable', () => {
    expect(new Set(taskPhaseSchema.options).size).toBe(taskPhaseSchema.options.length);
    expect(taskPhaseSchema.options.at(-1)).toBe('COMPLETED');
  });

  it('does not accept internal filesystem paths as viewer URLs', () => {
    const result = viewerManifestSchema.safeParse({
      revisionId: '123e4567-e89b-42d3-a456-426614174000',
      status: 'READY',
      version: '1',
      unit: 'mm',
      bounds: [0, 0, 0, 1, 1, 1],
      solidCount: 1,
      glbUrl: '/data/workspaces/private/model.glb',
      edgesUrl: null,
      topologyMapUrl: null,
      expiresAt: null,
    });
    expect(result.success).toBe(false);
  });

  it('validates a complete requirement snapshot', () => {
    const snapshot = requirementSnapshotSchema.parse({
      version: 1,
      unit: 'mm',
      dimensions: { length: 100, width: 50, thickness: 5 },
      features: ['four mounting holes'],
      constraints: ['single solid'],
      solidCount: 1,
      freecadRequested: false,
      selectionIds: [],
      attachmentIds: [],
      parentRevisionId: null,
      missing: [],
      conflicts: [],
    });
    expect(snapshot.dimensions.thickness).toBe(5);
  });

  it('validates topology ranges and geometry signatures', () => {
    const map = topologyMapSchema.parse({
      version: 'viewer-1',
      revisionId: 'd53e793a-a24d-4e33-a952-5b28faac665c',
      unit: 'mm',
      faces: [
        {
          displayId: 'F1',
          topologyRef: 'face_1',
          tags: [],
          signature: { geometryType: 'plane' },
          adjacentTopologyRefs: [],
          triangleStart: 0,
          triangleCount: 2,
        },
      ],
      edges: [],
    });
    expect(map.faces[0]?.triangleCount).toBe(2);
  });

  it('distinguishes failed FreeCAD conversion from core CAD success', () => {
    const conversion = freecadConversionSchema.parse({
      status: 'failed',
      documentArtifactId: null,
      scriptArtifactId: null,
      reason: 'worker unavailable',
      freecadVersion: null,
      adapterVersion: null,
      workerVersion: null,
    });
    expect(conversion.status).toBe('failed');
  });
});
