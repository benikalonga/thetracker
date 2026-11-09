import { db } from '../lib/db';

export const DEFAULTS = {
  geofenceMeters: 150,
  pingSeconds: 60,
  retentionDays: 90,
  atRiskMultiplier: 2,
};
export type Settings = typeof DEFAULTS;

export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany();
  const out = { ...DEFAULTS };
  for (const r of rows) if (r.key in out && Number.isFinite(Number(r.value))) out[r.key as keyof Settings] = Number(r.value);
  return out;
}
