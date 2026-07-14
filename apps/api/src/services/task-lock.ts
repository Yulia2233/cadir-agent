import type { Redis } from 'ioredis';

const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

export class ConversationTaskLock {
  public constructor(
    private readonly redis: Redis,
    private readonly leaseMs: number = 10 * 60 * 1_000,
  ) {}

  public async acquire(conversationId: string, taskId: string): Promise<boolean> {
    const result = await this.redis.set(
      `conversation:${conversationId}:write`,
      taskId,
      'PX',
      this.leaseMs,
      'NX',
    );
    return result === 'OK';
  }

  public async renew(conversationId: string, taskId: string): Promise<boolean> {
    const key = `conversation:${conversationId}:write`;
    if ((await this.redis.get(key)) !== taskId) return false;
    return (await this.redis.pexpire(key, this.leaseMs)) === 1;
  }

  public async release(conversationId: string, taskId: string): Promise<boolean> {
    const result = await this.redis.eval(
      RELEASE_SCRIPT,
      1,
      `conversation:${conversationId}:write`,
      taskId,
    );
    return result === 1;
  }
}
