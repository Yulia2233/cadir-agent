import { describe, expect, it, vi } from 'vitest';
import { ConversationTaskLock } from '../src/services/task-lock.js';

describe('conversation write lock', () => {
  it('acquires with a lease and releases only its token', async () => {
    const redis = {
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue(1),
    };
    const lock = new ConversationTaskLock(redis as never, 5_000);
    await expect(lock.acquire('conv', 'task')).resolves.toBe(true);
    expect(redis.set).toHaveBeenCalledWith('conversation:conv:write', 'task', 'PX', 5_000, 'NX');
    await expect(lock.release('conv', 'task')).resolves.toBe(true);
  });

  it('reports lock contention without overwriting the holder', async () => {
    const redis = { set: vi.fn().mockResolvedValue(null) };
    const lock = new ConversationTaskLock(redis as never);
    await expect(lock.acquire('conv', 'other-task')).resolves.toBe(false);
  });
});
