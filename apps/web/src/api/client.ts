type ApiErrorPayload = { error?: { code?: string; message?: string }; traceId?: string };

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let csrfToken: string | null = sessionStorage.getItem('cadir.csrf');

export function setCsrfToken(value: string | null): void {
  csrfToken = value;
  if (value === null) sessionStorage.removeItem('cadir.csrf');
  else sessionStorage.setItem('cadir.csrf', value);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
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
