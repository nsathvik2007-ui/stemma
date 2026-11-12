/* ---------------------------------------------------------------------------
   Transport. JWT lives in the Authorization header, never a cookie, so there
   is no CSRF token to carry. Access tokens are 60 minutes and refresh is 7
   days (see backend/stemma/settings.py SIMPLE_JWT) — a teacher working a
   review queue must not get logged out mid-pass, so a 401 triggers exactly one
   silent refresh-and-retry before it surfaces.
   --------------------------------------------------------------------------- */

/* Locally the API is Django's dev server on :8000. A production build is served
   from the same domain as the API (deploy/Caddyfile), so its requests stay
   relative and no cross-origin access is needed. */
const BASE =
  import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');

const ACCESS_KEY = 'stemma.access';
const REFRESH_KEY = 'stemma.refresh';

/* localStorage is readable by any script that gets injected into the page.
   Acceptable for a local/pilot build; revisit before a real deployment. */
export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API ${status}`);
    this.status = status;
    this.body = body;
  }
}

/* Ownership-scoped endpoints answer 404 rather than 403 for another teacher's
   course — deliberate, so the response doesn't reveal that the row exists.
   Callers must not translate a 404 into "forbidden". */
async function raw(path: string, init: RequestInit, withAuth: boolean): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (withAuth && tokens.access) {
    headers.set('Authorization', `Bearer ${tokens.access}`);
  }
  return fetch(`${BASE}/api${path}`, { ...init, headers });
}

/* Fired when the refresh token itself is rejected — the session is over, not
   just the access token. AuthContext listens and signs out, so the route guard
   sends the user to /login instead of leaving them on a screen whose every
   request now 401s. */
export const SESSION_EXPIRED = 'stemma:session-expired';

async function refreshAccess(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  const res = await raw('/token/refresh/', { method: 'POST', body: JSON.stringify({ refresh }) }, false);
  if (!res.ok) {
    tokens.clear();
    window.dispatchEvent(new Event(SESSION_EXPIRED));
    return false;
  }
  const data = (await res.json()) as { access: string };
  tokens.set(data.access);
  return true;
}

/* Authenticated request with the one silent refresh-and-retry. Shared by JSON
   calls and binary ones, so a photo fetch survives an expired access token the
   same way every other call does. */
async function send(path: string, init: RequestInit = {}): Promise<Response> {
  let res = await raw(path, init, true);

  if (res.status === 401 && (await refreshAccess())) {
    res = await raw(path, init, true);
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body);
  }
  return res;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /* For files behind auth. An <img src> cannot send the Authorization header,
     so the bytes are fetched here and shown through an object URL. */
  blob: (path: string) => send(path).then((r) => r.blob()),
};

export type Role = 'teacher' | 'student';

/* The server decides the role and returns it alongside the pair (it is also a
   claim on the token itself). The client never asks the user which they are. */
export interface Identity { role: Role; email: string; }

export async function login(username: string, password: string): Promise<Identity> {
  const res = await raw('/token/', { method: 'POST', body: JSON.stringify({ username, password }) }, false);
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const data = (await res.json()) as { access: string; refresh: string; role: Role; email: string };
  tokens.set(data.access, data.refresh);
  return { role: data.role, email: data.email };
}
