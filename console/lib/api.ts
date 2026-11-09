'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const KEY = 'thetracker.console';

export interface Session { accessToken: string; refreshToken: string; profile: any }

export const session = {
  get(): Session | null {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  },
  set(value: Session) { localStorage.setItem(KEY, JSON.stringify(value)); },
  clear() { localStorage.removeItem(KEY); },
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

let refreshing: Promise<boolean> | null = null;
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const current = session.get();
    if (!current) return false;
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: current.refreshToken }) });
      if (!res.ok) return false;
      session.set({ ...current, ...(await res.json()) });
      return true;
    } catch { return false; } finally { refreshing = null; }
  })();
  return refreshing;
}

async function raw(path: string, init: { method?: string; body?: unknown } = {}) {
  const send = () => fetch(`${API_URL}/api${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(session.get() ? { authorization: `Bearer ${session.get()!.accessToken}` } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && session.get() && (await refresh())) res = await send();
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  if (res.status === 401 && session.get() && !path.startsWith('/auth/')) {
    session.clear();
    window.location.href = '/sign-in';
  }
  return res;
}

export async function api<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await raw(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong.', res.status);
  return data as T;
}

export async function download(path: string, filename: string) {
  const res = await raw(path);
  if (!res.ok) throw new ApiError('Could not download the file.', res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
