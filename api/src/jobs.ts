import cron from 'node-cron';
import { db } from './lib/db';
import { config } from './lib/config';
import { getSettings } from './domain/settings';
import { notify } from './domain/support';
import { dayKey, dayRange } from './domain/time';

const OPEN_SHIFT_LIMIT_MS = 16 * 3_600_000;

/** Customers nobody has seen for too long need attention. */
export async function flagAtRiskCustomers(now = new Date()) {
  const { atRiskMultiplier } = await getSettings();
  const candidates = await db.customer.findMany({
    where: { archivedAt: null, status: 'ACTIVE', lastVisitAt: { not: null } },
    select: { id: true, name: true, lastVisitAt: true, visitEveryDays: true, assignedToId: true },
  });
  const late = candidates.filter((c) => now.getTime() - c.lastVisitAt!.getTime() > c.visitEveryDays * atRiskMultiplier * 864e5);
  for (const c of late) {
    await db.customer.update({ where: { id: c.id }, data: { status: 'AT_RISK' } });
    if (c.assignedToId) await notify(c.assignedToId, 'customer_at_risk', 'Customer at risk', `${c.name} has not been visited for a while.`, { customerId: c.id });
  }
  return late.length;
}

/** One reminder per task, the first time it is found due. */
export async function remindDueTasks() {
  const due = await db.task.findMany({ where: { status: 'OPEN', remindedAt: null, dueAt: { lt: dayRange(dayKey()).lt } }, select: { id: true, title: true, assignedToId: true } });
  for (const t of due) {
    await db.task.update({ where: { id: t.id }, data: { remindedAt: new Date() } });
    await notify(t.assignedToId, 'task_due', 'Task due', t.title, { taskId: t.id });
  }
  return due.length;
}

/** A shift someone forgot to end must not keep sharing their location. */
export async function closeForgottenWork(now = new Date()) {
  const cutoff = new Date(now.getTime() - OPEN_SHIFT_LIMIT_MS);
  const forgotten = await db.shift.findMany({ where: { openKey: { not: null }, startedAt: { lt: cutoff } } });
  for (const s of forgotten) {
    const lastPing = await db.locationPing.findFirst({ where: { shiftId: s.id }, orderBy: { recordedAt: 'desc' } });
    await db.$transaction([
      db.visit.updateMany({ where: { agentId: s.agentId, openKey: { not: null } }, data: { status: 'CANCELLED', openKey: null, review: 'NOT_NEEDED' } }),
      db.shift.update({ where: { id: s.id }, data: { openKey: null, endedAt: lastPing?.recordedAt ?? new Date(s.startedAt.getTime() + OPEN_SHIFT_LIMIT_MS), autoClosed: true } }),
    ]);
    await notify(s.agentId, 'shift_closed', 'Shift closed automatically', 'Your shift was still open after 16 hours, so we ended it.');
  }
  return forgotten.length;
}

export async function purgeOldData(now = new Date()) {
  const { retentionDays } = await getSettings();
  const cutoff = new Date(now.getTime() - retentionDays * 864e5);
  const [pings] = await Promise.all([
    db.locationPing.deleteMany({ where: { recordedAt: { lt: cutoff } } }),
    db.refreshSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.notification.deleteMany({ where: { createdAt: { lt: cutoff }, readAt: { not: null } } }),
  ]);
  return pings.count;
}

const guard = (name: string, job: () => Promise<unknown>) => () => job().catch((err) => console.error(`job ${name} failed`, err));

export function startJobs() {
  const timezone = config.timezone;
  cron.schedule('*/15 * * * *', guard('forgotten-work', closeForgottenWork), { timezone });
  cron.schedule('0 6 * * *', guard('at-risk', flagAtRiskCustomers), { timezone });
  cron.schedule('5 7 * * *', guard('task-reminders', remindDueTasks), { timezone });
  cron.schedule('30 2 * * *', guard('purge', purgeOldData), { timezone });
}
