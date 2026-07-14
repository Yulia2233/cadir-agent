import type { PrismaClient, User, UserRole } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../config.js';
import type { ObjectStore } from '../services/object-store.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    prisma: PrismaClient;
    redis: Redis;
    objectStore: ObjectStore;
    authenticate: (request: FastifyRequest) => Promise<void>;
    requireRole: (roles: UserRole[]) => (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    authUser: Pick<User, 'id' | 'email' | 'displayName' | 'role' | 'status'>;
    authSessionId: string;
  }
}

export {};
