import * as SecureStore from 'expo-secure-store';
import type { Profile } from './types';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
const KEY = 'thetracker.tokens';
const TIMEOUT_MS = 20_000;

interface Tokens { accessToken: string; refreshToken: string }
let tokens: Tokens | null = null;
let onExpired: () => void = () => {};
export const setExpiredHandler = (fn: () => void) => { onExpired = fn; };
let onReachability: (reachable: boolean) => void = () => {};
/** Any answer from the server proves the connection works, whatever the phone reports about its network. */
export const setReachabilityHandler = (fn: (reachable: boolean) => void) => { onReachability = fn; };

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, any> = {}) { super(message); }
  /** The request never reached a verdict from the server, so it is worth retrying. */
  get retryable() { return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500; }
}

const saveTokens = async (next: Tokens | null) => {
  tokens = next;
  if (next) await SecureStore.setItemAsync(KEY, JSON.stringify(next));
  else await SecureStore.deleteItemAsync(KEY);
};

export async function restoreTokens(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(KEY).catch(() => null);
  tokens = raw ? JSON.parse(raw) : null;
  return !!tokens;
}

async function send(path: string, method: string, body: unknown, withAuth: boolean) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      method,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(withAuth && tokens ? { authorization: `Bearer ${tokens.accessToken}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    onReachability(true);
    return res;
  } catch {
    onReachability(false);
    throw new ApiError('You appear to be offline.', 0);
  } finally {
    clearTimeout(timer);
  }
}

let refreshing: Promise<boolean> | null = null;
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await send('/auth/refresh', 'POST', { refreshToken: tokens?.refreshToken }, false);
      if (!res.ok) {
        if (res.status >= 500) throw new ApiError('The server is unavailable.', res.status);
        return false;
      }
      await saveTokens(await res.json());
      return true;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET');
  let res = await send(path, method, init.body, true);
  if (res.status === 401 && tokens) {
    if (await refresh()) res = await send(path, method, init.body, true);
    else {
      await saveTokens(null);
      onExpired();
      throw new ApiError('Your session has expired.', 401);
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong.', res.status, data);
  return data as T;
}

export async function signIn(email: string, password: string): Promise<Profile> {
  const res = await send('/auth/login', 'POST', { email, password }, false);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Could not sign in.', res.status);
  await saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.profile;
}

/** Asks the server directly when the phone claims to have no network. */
export const probeApi = () => send('/health', 'GET', undefined, false).then(() => {}, () => {});

export async function signOutRemote() {
  const current = tokens;
  await saveTokens(null);
  if (current) await send('/auth/logout', 'POST', { refreshToken: current.refreshToken }, false).catch(() => {});
}

export async function replaceTokens(next: Tokens) { await saveTokens(next); }
