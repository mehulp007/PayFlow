import type { ApiError as ApiErrorBody } from '@payflow/shared';

const TOKEN_KEY = 'payflow-session';
export const AUTH_EXPIRED_EVENT = 'payflow:auth-expired';

/** The session token lives in tab-scoped storage, so closing the tab signs the user out. */
export const sessionToken = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string | null) =>
    token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ApiErrorBody['issues'] = [],
  ) {
    super(message);
  }
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const token = sessionToken.get();
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (response.ok) return response;
  if (response.status === 401 && token && path !== '/auth/login') {
    sessionToken.set(null);
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
  const body = (await response.json().catch(() => ({ error: response.statusText }))) as ApiErrorBody;
  throw new ApiError(response.status, body.error ?? response.statusText, body.issues);
}

const json = <T>(response: Response) => response.json() as Promise<T>;
const withBody = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body ?? {}) });

export const api = {
  get: <T>(path: string) => send(path).then(json<T>),
  post: <T>(path: string, body?: unknown) => send(path, withBody('POST', body)).then(json<T>),
  patch: <T>(path: string, body: unknown) => send(path, withBody('PATCH', body)).then(json<T>),
  delete: <T>(path: string) => send(path, { method: 'DELETE' }).then(json<T>),
};

/** Downloads a file response (CSV exports) using the session token. */
export async function download(path: string): Promise<void> {
  const response = await send(path);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'report.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
