import { z } from 'zod';

export type ProviderProbeResult =
  | { status: 'succeeded' }
  | { status: 'failed'; reason: 'provider_rejected_model' | 'provider_unreachable' };

export async function probeProviderModel(input: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  timeoutMs?: number;
}): Promise<ProviderProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 15_000);
  try {
    const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: input.modelId,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        max_tokens: 1,
        temperature: 0,
        stream: false,
      }),
      signal: controller.signal,
    });
    return response.ok
      ? { status: 'succeeded' }
      : { status: 'failed', reason: 'provider_rejected_model' };
  } catch {
    return { status: 'failed', reason: 'provider_unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}

const providerModelsSchema = z
  .object({
    data: z.array(z.object({ id: z.string().trim().min(1).max(200) }).passthrough()).max(10_000),
  })
  .passthrough();

export type ProviderModelsResult =
  | { status: 'succeeded'; models: string[] }
  | {
      status: 'failed';
      reason: 'provider_rejected_request' | 'provider_invalid_response' | 'provider_unreachable';
    };

export async function listProviderModels(input: {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}): Promise<ProviderModelsResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 15_000);
  try {
    const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/models`, {
      method: 'GET',
      redirect: 'error',
      headers: { authorization: `Bearer ${input.apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) return { status: 'failed', reason: 'provider_rejected_request' };
    const parsed = providerModelsSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return { status: 'failed', reason: 'provider_invalid_response' };
    return {
      status: 'succeeded',
      models: [...new Set(parsed.data.data.map((model) => model.id))].sort().slice(0, 500),
    };
  } catch {
    return { status: 'failed', reason: 'provider_unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}
