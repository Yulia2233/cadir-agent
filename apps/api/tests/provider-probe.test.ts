import { afterEach, describe, expect, it, vi } from 'vitest';
import { listProviderModels, probeProviderModel } from '../src/services/provider-probe.js';

afterEach(() => vi.unstubAllGlobals());

describe('Provider model probe', () => {
  it('tests the configured model with a bounded completion request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      probeProviderModel({
        baseUrl: 'https://provider.example/v1',
        apiKey: 'test-only',
        modelId: '5.6-sol',
      }),
    ).resolves.toEqual({ status: 'succeeded' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://provider.example/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.body).toContain('5.6-sol');
  });

  it('does not report success when the account pool rejects the configured model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));
    await expect(
      probeProviderModel({
        baseUrl: 'https://provider.example/v1',
        apiKey: 'test-only',
        modelId: '5.6-sol',
      }),
    ).resolves.toEqual({ status: 'failed', reason: 'provider_rejected_model' });
  });

  it('loads, deduplicates, sorts, and bounds OpenAI-compatible model IDs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ id: 'z-model' }, { id: 'a-model' }, { id: 'a-model' }] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      listProviderModels({ baseUrl: 'https://provider.example/v1', apiKey: 'test-only' }),
    ).resolves.toEqual({ status: 'succeeded', models: ['a-model', 'z-model'] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://provider.example/v1/models');
    expect(init.redirect).toBe('error');
  });

  it('rejects malformed model-list responses without exposing provider content', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ data: [{ id: '' }] }), { status: 200 })),
    );
    await expect(
      listProviderModels({ baseUrl: 'https://provider.example/v1', apiKey: 'test-only' }),
    ).resolves.toEqual({ status: 'failed', reason: 'provider_invalid_response' });
  });
});
