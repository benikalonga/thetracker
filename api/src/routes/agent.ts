import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';
import { requireUser } from '../lib/auth';
import { conflict, h, listOf, paging, parse } from '../lib/http';
import { emitToSupervisors } from '../lib/realtime';
import { trailDistanceKm } from '../domain/geo';
import { planInclude, planSummary } from '../domain/plans';
import { addDays, dayKey, dayRange, eventTime, startOfDay } from '../domain/time';
import { ensureShift, visitInclude } from '../domain/visits';

export const agentRoutes = Router();
agentRoutes.use(requireUser);

const taskInclude = { customer: { select: { id: true, name: true, city: true, lat: true, lng: true } } } as const;
const spot = { lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(), occurredAt: z.coerce.date().optional() };

agentRoutes.get('/today', h(async (req, res) => {
  const date = dayKey();
  const range = dayRange(date);
  const me = req.user.id;
  const [shift, openVisit, plan, tasksDue, overdue, visits, unread, shifts] = await Promise.all([
    db.shift.findUnique({ where: { openKey: me } }),
    db.visit.findUnique({ where: { openKey: me }, include: visitInclude }),
    db.dayPlan.findUnique({ where: { agentId_date: { agentId: me, date } }, include: planInclude }),
    db.task.findMany({ where: { assignedToId: me, status: 'OPEN', dueAt: { lt: range.lt } }, orderBy: { dueAt: 'asc' }, take: 30, include: taskInclude }),
    db.task.count({ where: { assignedToId: me, status: 'OPEN', dueAt: { lt: range.gte } } }),
    db.visit.aggregate({ where: { agentId: me, status: 'COMPLETED', checkInAt: range }, _count: true, _sum: { orderCents: true } }),
    db.notification.count({ where: { userId: me, readAt: null } }),
    db.shift.aggregate({ where: { agentId: me, startedAt: range }, _sum: { distanceKm: true } }),
  ]);
  res.json({
    date, shift, openVisit,
    plan: plan ? { ...plan, summary: planSummary(plan) } : null,
    tasksDue, unread,
    stats: { visits: visits._count, target: req.user.dailyVisitTarget, orderCents: visits._sum.orderCents ?? 0, distanceKm: shifts._sum.distanceKm ?? 0, overdueTasks: overdue },
  });
}));

agentRoutes.post('/shift/start', h(async (req, res) => {
  const body = parse(z.object(spot), req.body ?? {});
  const pos = body.lat != null && body.lng != null ? { lat: body.lat, lng: body.lng } : undefined;
  res.json(await ensureShift(req.user.id, eventTime(body.occurredAt), pos));
}));

agentRoutes.post('/shift/end', h(async (req, res) => {
  const body = parse(z.object(spot), req.body ?? {});
  const open = await db.visit.findUnique({ where: { openKey: req.user.id }, select: { id: true } });
  if (open) throw conflict('Check out of your current visit first.', { code: 'VISIT_OPEN' });
  const shift = await db.shift.findUnique({ where: { openKey: req.user.id } });
  if (!shift) return res.json({ ok: true }); // already ended
  const at = eventTime(body.occurredAt);
  res.json(await db.shift.update({ where: { id: shift.id }, data: { openKey: null, endedAt: at < shift.startedAt ? shift.startedAt : at, endLat: body.lat, endLng: body.lng } }));
}));

/** Position history is only stored during a shift, so an agent's off-duty movements are never recorded. */
agentRoutes.post('/locations', h(async (req, res) => {
  const body = parse(z.object({
    battery: z.number().int().min(0).max(100).nullish(),
    points: z.array(z.object({
      lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
      accuracy: z.number().nullish(), speed: z.number().nullish(), recordedAt: z.coerce.date(),
    })).min(1).max(500),
  }), req.body);
  const me = req.user.id;
  const shift = await db.shift.findUnique({ where: { openKey: me } });
  if (!shift) return res.json({ accepted: 0, onShift: false });

  const now = Date.now();
  const points = body.points
    .filter((p) => p.recordedAt >= shift.startedAt && p.recordedAt.getTime() <= now + 60_000)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  if (!points.length) return res.json({ accepted: 0, onShift: true });

  const last = await db.locationPing.findFirst({ where: { shiftId: shift.id }, orderBy: { recordedAt: 'desc' } });
  const fresh = last ? points.filter((p) => p.recordedAt > last.recordedAt) : points;
  const inserted = await db.locationPing.createMany({
    data: points.map((p) => ({ agentId: me, shiftId: shift.id, lat: p.lat, lng: p.lng, accuracy: p.accuracy ?? null, speed: p.speed ?? null, recordedAt: p.recordedAt })),
    skipDuplicates: true,
  });
  const addedKm = trailDistanceKm(last ? [last, ...fresh] : fresh);
  if (addedKm > 0) await db.shift.update({ where: { id: shift.id }, data: { distanceKm: { increment: addedKm } } });

  const newest = points[points.length - 1];
  await db.user.update({ where: { id: me }, data: { lastLat: newest.lat, lastLng: newest.lng, lastSeenAt: newest.recordedAt, battery: body.battery ?? undefined } });
  emitToSupervisors(req.user.managerId, 'agent:location', { agentId: me, lat: newest.lat, lng: newest.lng, at: newest.recordedAt, battery: body.battery ?? null });
  res.json({ accepted: inserted.count, onShift: true });
}));

agentRoutes.get('/stats', h(async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  const today = dayKey();
  const from = startOfDay(addDays(today, 1 - days));
  const visits = await db.visit.findMany({ where: { agentId: req.user.id, status: 'COMPLETED', checkInAt: { gte: from } }, select: { checkInAt: true, checkOutAt: true, outcome: true, orderCents: true, withinGeofence: true } });
  const shifts = await db.shift.aggregate({ where: { agentId: req.user.id, startedAt: { gte: from } }, _sum: { distanceKm: true } });

  const byDay = new Map<string, number>();
  for (let i = 0; i < days; i++) byDay.set(addDays(today, i - days + 1), 0);
  const outcomes: Record<string, number> = {};
  let minutes = 0;
  let orderCents = 0;
  let verified = 0;
  for (const v of visits) {
    const key = dayKey(v.checkInAt);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
    if (v.outcome) outcomes[v.outcome] = (outcomes[v.outcome] ?? 0) + 1;
    if (v.checkOutAt) minutes += (v.checkOutAt.getTime() - v.checkInAt.getTime()) / 60_000;
    orderCents += v.orderCents;
    if (v.withinGeofence) verified++;
  }
  res.json({
    days,
    visits: visits.length,
    orderCents,
    distanceKm: shifts._sum.distanceKm ?? 0,
    avgMinutes: visits.length ? Math.round(minutes / visits.length) : 0,
    verifiedPct: visits.length ? Math.round((verified / visits.length) * 100) : 100,
    target: req.user.dailyVisitTarget,
    series: [...byDay].map(([date, count]) => ({ date, count })),
    outcomes,
  });
}));

agentRoutes.get('/notifications', h(async (req, res) => {
  const p = paging(req.query, 30);
  const where = { userId: req.user.id };
  const [items, total, unread] = await Promise.all([
    db.notification.findMany({ where, skip: p.skip, take: p.take, orderBy: { createdAt: 'desc' } }),
    db.notification.count({ where }),
    db.notification.count({ where: { ...where, readAt: null } }),
  ]);
  res.json({ ...listOf(items, total, p), unread });
}));

agentRoutes.post('/notifications/read', h(async (req, res) => {
  const body = parse(z.object({ ids: z.array(z.string().uuid()).max(200).optional() }), req.body ?? {});
  await db.notification.updateMany({ where: { userId: req.user.id, readAt: null, ...(body.ids ? { id: { in: body.ids } } : {}) }, data: { readAt: new Date() } });
  res.json({ ok: true });
}));

