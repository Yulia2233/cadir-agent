import { createOpencodeClient } from '@opencode-ai/sdk/v2/client';
import { z } from 'zod';
import type { AgentMode } from './policy.js';

export const OPENCODE_VERSION = '1.4.9';
export const OPENCODE_COMMIT = '803d9eb7ad5f4dfd832d7506a7cad83ded52253e';

const sessionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
  })
  .passthrough();

const sdkSessionSchema = z
  .object({
    id: z.string().min(1).optional(),
    sessionID: z.string().min(1).optional(),
  })
  .passthrough()
  .refine((value) => value.id !== undefined || value.sessionID !== undefined);

const messageSchema = z
  .object({
    info: z.object({ id: z.string().min(1) }).passthrough(),
    parts: z.array(z.unknown()),
  })
  .passthrough();

export type OpenCodeProvider = {
  providerId: string;
  modelId: string;
};

export type OpenCodePrompt = {
  sessionId: string;
  directory: string;
  mode: AgentMode;
  content: string;
  system: string;
  provider: OpenCodeProvider;
};

function basicAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export class OpenCodeClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  public constructor(
    baseUrl: string,
    options: { username: string; password: string; timeoutMs?: number },
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.headers = {
      authorization: basicAuthorization(options.username, options.password),
      'content-type': 'application/json',
    };
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  private readonly timeoutMs: number;

  public async health(): Promise<{ version: string; healthy: true }> {
    const response = await this.request('/global/health', {});
    const payload = z
      .object({ healthy: z.literal(true), version: z.string().min(1) })
      .passthrough()
      .parse(await response.json());
    return { healthy: true, version: payload.version };
  }

  public async createSession(input: {
    directory: string;
    title?: string;
  }): Promise<{ id: string; title?: string }> {
    const response = await this.request('/session', {
      method: 'POST',
      directory: input.directory,
      body: {
        ...(input.title === undefined ? {} : { title: input.title }),
      },
    });
    const raw = await response.json();
    const data = sdkSessionSchema.parse(raw);
    const title = sessionSchema.partial().parse(raw).title;
    return {
      id: data.id ?? data.sessionID!,
      ...(title === undefined ? {} : { title }),
    };
  }

  public async getSession(sessionId: string, directory: string): Promise<{ id: string }> {
    const result = await this.sdk(directory).session.get({ sessionID: sessionId });
    return sessionSchema.pick({ id: true }).parse(unwrapSdkData(result));
  }

  public async deleteSession(sessionId: string, directory: string): Promise<void> {
    await this.sdk(directory).session.delete({ sessionID: sessionId });
  }

  public async abortSession(sessionId: string, directory: string): Promise<void> {
    await this.sdk(directory).session.abort({ sessionID: sessionId });
  }

  public async prompt(input: OpenCodePrompt): Promise<{ messageId: string; parts: unknown[] }> {
    const client = this.sdk(input.directory);
    const result = await client.session.prompt({
      sessionID: input.sessionId,
      agent: input.mode === 'PLAN' ? 'plan' : 'cadir',
      model: {
        providerID: input.provider.providerId,
        modelID: input.provider.modelId,
      },
      system: input.system,
      parts: [{ type: 'text', text: input.content }],
    });
    const data = messageSchema.parse(unwrapSdkData(result));
    return { messageId: data.info.id, parts: data.parts };
  }

  private sdk(directory: string) {
    return createOpencodeClient({
      baseUrl: this.baseUrl,
      directory,
      headers: this.headers,
    });
  }

  private async request(
    path: string,
    options: { method?: string; directory?: string; body?: unknown },
  ): Promise<Response> {
    const response = await fetch(new URL(path, `${this.baseUrl}/`), {
      ...(options.method === undefined ? {} : { method: options.method }),
      headers: {
        ...this.headers,
        ...(options.directory === undefined ? {} : { 'x-opencode-directory': options.directory }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`OpenCode request failed with status ${response.status}`);
    }
    return response;
  }
}

function unwrapSdkData(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'data' in value) {
    const result = value as { data?: unknown; error?: unknown };
    if (result.error !== undefined) throw new Error('OpenCode returned an error response');
    return result.data;
  }
  return value;
}
