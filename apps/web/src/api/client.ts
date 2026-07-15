type ApiErrorPayload = { error?: { code?: string; message?: string }; traceId?: string };

export type ApiRequestOptions = RequestInit & { signal?: AbortSignal };

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|; )cadir_csrf=([^;]*)/);
  return match?.[1] === undefined ? null : decodeURIComponent(match[1]);
}

let csrfToken: string | null = sessionStorage.getItem('cadir.csrf') ?? readCsrfCookie();

export function setCsrfToken(value: string | null): void {
  csrfToken = value;
  if (value === null) sessionStorage.removeItem('cadir.csrf');
  else sessionStorage.setItem('cadir.csrf', value);
}

export function currentCsrfToken(
  cookieValue: string | null,
  cachedValue: string | null,
): string | null {
  return cookieValue ?? cachedValue;
}

export async function apiRequest<T>(path: string, init: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  csrfToken = currentCsrfToken(readCsrfCookie(), csrfToken);
  if (csrfToken !== null && !['GET', 'HEAD'].includes(init.method ?? 'GET')) {
    headers.set('x-csrf-token', csrfToken);
  }
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'REQUEST_FAILED',
      payload.error?.message ?? 'The request could not be completed',
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function openEventStream(
  conversationId: string,
  onEvent: (event: MessageEvent<string>) => void,
): EventSource {
  const source = new EventSource(`/api/conversations/${conversationId}/events`, {
    withCredentials: true,
  });
  const eventNames = [
    'conversation.title.updated',
    'task.created',
    'task.phase.changed',
    'task.completed',
    'task.failed',
    'task.aborted',
    'agent.message.completed',
    'model.revision.published',
    'selection.invalidated',
  ];
  for (const eventName of eventNames) source.addEventListener(eventName, onEvent as EventListener);
  return source;
}
