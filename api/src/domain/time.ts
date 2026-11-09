import { config } from '../lib/config';
import { badRequest } from '../lib/http';

/** YYYY-MM-DD for an instant, in the company's timezone. */
export const dayKey = (d: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

function zoneOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The first instant of a YYYY-MM-DD day in the company's timezone. */
export function startOfDay(key: string): Date {
  const utc = new Date(`${key}T00:00:00.000Z`);
  return new Date(utc.getTime() - zoneOffsetMs(utc));
}

export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const dayRange = (key: string) => ({ gte: startOfDay(key), lt: startOfDay(addDays(key, 1)) });

const MAX_OFFLINE_AGE_MS = 14 * 864e5;

/**
 * When the phone says something happened. Offline actions arrive late and keep their real time,
 * but a wrong clock cannot place events in the future or in the distant past.
 */
export function eventTime(occurredAt?: Date): Date {
  const now = new Date();
  if (!occurredAt || occurredAt > now) return now;
  if (now.getTime() - occurredAt.getTime() > MAX_OFFLINE_AGE_MS) throw badRequest('That action is too old to record.');
  return occurredAt;
}
