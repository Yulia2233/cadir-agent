import { describe, expect, it } from 'vitest';
import { eventStreamKey } from './event-stream-key';

describe('event stream identity', () => {
  it('does not change when conversation metadata changes', () => {
    const base = {
      id: 'conversation-1',
      title: 'Initial',
      status: 'RUNNING' as const,
      updatedAt: '2026-07-15T00:00:00Z',
      currentRevisionId: null,
    };
    expect(eventStreamKey(base)).toBe(
      eventStreamKey({ ...base, title: 'Updated', status: 'FAILED' }),
    );
  });
});
