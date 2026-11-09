import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../lib/db';
import { requireAdmin, requireManager, requireUser } from '../lib/auth';
import { badRequest, conflict, forbidden, h, isUniqueViolation, listOf, notFound, paging, parse } from '../lib/http';
import { agentScope, audit } from '../domain/support';
import { getSettings } from '../domain/settings';
import { addDays, dayKey, dayRange, startOfDay } from '../domain/time';

export const manageRoutes = Router();
manageRoutes.use(requireUser, requireManager);

const LIVE_AFTER_MS = 10 * 60_000;

manageRoutes.get('/overview', h(async (req, res) => {
  const today = dayKey();
  const range = dayRange(today);
  const team = agentScope(req.user);
  const customerScopeFilter: Prisma.CustomerWhereInput = req.user.role === 'ADMIN' ? {} : { OR: [{ assignedTo: { managerId: req.user.id } }, { assignedToId: null }] };
  const from = startOfDay(addDays(today, -13));
  const [agents, onShift, done, pendingReview, orders, overdueTasks, byStatus, recent, series] = await Promise.all([
    db.user.count({ where: { AND: [team, { role: 'AGENT', isActive: true }] } }),
    db.shift.count({ where: { openKey: { not: null }, agent: team } }),
    db.visit.count({ where: { agent: team, status: 'COMPLETED', checkInAt: range } }),
    db.visit.count({ where: { agent: team, review: 'PENDING' } }),
    db.visit.aggregate({ where: { agent: team, status: 'COMPLETED', checkInAt: range }, _sum: { orderCents: true } }),
    db.task.count({ where: { assignedTo: team, status: 'OPEN', dueAt: { lt: range.gte } } }),
    db.customer.groupBy({ by: ['status'], where: { AND: [customerScopeFilter, { archivedAt: null }] }, _count: true }),
    db.visit.findMany({ where: { agent: team, status: 'COMPLETED' }, orderBy: { checkOutAt: 'desc' }, take: 8, include: { customer: { select: { name: true } }, agent: { select: { fullName: true } } } }),
    db.visit.findMany({ where: { agent: team, status: 'COMPLETED', checkInAt: { gte: from } }, select: { checkInAt: true } }),
  ]);
  const days = new Map<string, number>();
  for (let i = 0; i < 14; i++) days.set(addDays(today, i - 13), 0);
  for (const v of series) {
    const k = dayKey(v.checkInAt);
    days.set(k, (days.get(k) ?? 0) + 1);
  }
  res.json({
    agents, onShift, visitsToday: done, pendingReview, ordersTodayCents: orders._sum.orderCents ?? 0, overdueTasks,
    customers: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    recent,
    series: [...days].map(([date, count]) => ({ date, count })),
  });
}));

manageRoutes.get('/live', h(async (req, res) => {
  const today = dayRange(dayKey());
  const agents = await db.user.findMany({
    where: { AND: [agentScope(req.user), { role: 'AGENT', isActive: true }] },
    orderBy: { fullName: 'asc' },
    select: {
      id: true, fullName: true, phone: true, lastLat: true, lastLng: true, lastSeenAt: true, battery: true, dailyVisitTarget: true,
      shifts: { where: { openKey: { not: null } }, select: { id: true, startedAt: true, distanceKm: true } },
      visits: { where: { OR: [{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', checkInAt: today }] }, select: { status: true, checkInAt: true, customer: { select: { name: true } } } },
    },
  });
  const now = Date.now();
  res.json(agents.map(({ shifts, visits, ...a }) => {
    const current = visits.find((v) => v.status === 'IN_PROGRESS');
    const onShift = shifts.length > 0;
    return {
      ...a,
      onShift,
      // A location is only shared while on shift, including with supervisors.
      lastLat: onShift ? a.lastLat : null,
      lastLng: onShift ? a.lastLng : null,
      stale: !a.lastSeenAt || now - a.lastSeenAt.getTime() > LIVE_AFTER_MS,
      shift: shifts[0] ?? null,
      visitsToday: visits.filter((v) => v.status === 'COMPLETED').length,
      currentCustomer: current?.customer.name ?? null,
      currentSince: current?.checkInAt ?? null,
    };
  }));
}));

manageRoutes.get('/agents/:id/day', h(async (req, res) => {
  const date = parse(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(dayKey()), req.query.date);
  const agent = await db.user.findFirst({ where: { id: req.params.id, ...agentScope(req.user) }, select: { id: true, fullName: true } });
  if (!agent) throw notFound('Agent not found.');
  const range = dayRange(date);
  const [points, visits, shifts] = await Promise.all([
    db.locationPing.findMany({ where: { agentId: agent.id, recordedAt: range }, orderBy: { recordedAt: 'asc' }, take: 5000, select: { lat: true, lng: true, recordedAt: true } }),
    db.visit.findMany({ where: { agentId: agent.id, checkInAt: range }, orderBy: { checkInAt: 'asc' }, include: { customer: { select: { name: true, lat: true, lng: true } } } }),
    db.shift.findMany({ where: { agentId: agent.id, startedAt: range }, orderBy: { startedAt: 'asc' } }),
  ]);
  res.json({ agent, date, points, visits, shifts });
}));

const teamSelect = { id: true, fullName: true, email: true, phone: true, role: true, isActive: true, managerId: true, dailyVisitTarget: true, lastSeenAt: true, createdAt: true, manager: { select: { id: true, fullName: true } } } as const;

manageRoutes.get('/team', h(async (req, res) => {
  res.json(await db.user.findMany({ where: agentScope(req.user), orderBy: [{ role: 'asc' }, { fullName: 'asc' }], select: teamSelect }));
}));

const password = z.string().min(10, 'Use at least 10 characters.').max(100);

manageRoutes.post('/team', h(async (req, res) => {
  const body = parse(z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().max(32).nullish(),
    password,
    role: z.enum(['ADMIN', 'MANAGER', 'AGENT']).default('AGENT'),
    managerId: z.string().uuid().nullish(),
    dailyVisitTarget: z.number().int().min(0).max(100).default(8),
  }), req.body);
  if (req.user.role !== 'ADMIN' && body.role !== 'AGENT') throw forbidden('Only an admin can create managers and admins.');
  const managerId = req.user.role === 'ADMIN' ? await validManager(body.managerId) : req.user.id;
  try {
    const { password: plain, ...rest } = body;
    const user = await db.user.create({ data: { ...rest, managerId, phone: rest.phone || null, passwordHash: await bcrypt.hash(plain, 12) }, select: teamSelect });
    await audit(req.user.id, 'user.created', 'user', user.id, { role: user.role });
    res.status(201).json(user);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('That email is already registered.');
    throw err;
  }
}));

async function validManager(id?: string | null) {
  if (!id) return null;
  const manager = await db.user.findFirst({ where: { id, role: { in: ['MANAGER', 'ADMIN'] }, isActive: true } });
  if (!manager) throw badRequest('Choose an active manager.');
  return manager.id;
}

async function teamMember(actor: Express.Request['user'], id: string) {
  const user = await db.user.findFirst({ where: { id, ...agentScope(actor) } });
  if (!user) throw notFound('Team member not found.');
  if (user.id === actor.id) throw badRequest('Use your own account settings for this.');
  return user;
}

manageRoutes.patch('/team/:id', h(async (req, res) => {
  const target = await teamMember(req.user, req.params.id);
  const body = parse(z.object({
    fullName: z.string().trim().min(2).max(120), phone: z.string().trim().max(32).nullable(), isActive: z.boolean(),
    role: z.enum(['ADMIN', 'MANAGER', 'AGENT']), managerId: z.string().uuid().nullable(), dailyVisitTarget: z.number().int().min(0).max(100),
  }).partial(), req.body);
  if (req.user.role !== 'ADMIN' && (body.role !== undefined || body.managerId !== undefined)) throw forbidden('Only an admin can change roles and reporting lines.');
  const data: Prisma.UserUncheckedUpdateInput = { ...body };
  if (body.managerId !== undefined) data.managerId = await validManager(body.managerId);
  const user = await db.user.update({ where: { id: target.id }, data, select: teamSelect });
  if (body.isActive === false) await db.refreshSession.deleteMany({ where: { userId: target.id } });
  await audit(req.user.id, 'user.updated', 'user', target.id, { fields: Object.keys(body) });
  res.json(user);
}));

manageRoutes.post('/team/:id/password', h(async (req, res) => {
  const target = await teamMember(req.user, req.params.id);
  const body = parse(z.object({ password }), req.body);
  await db.$transaction([
    db.user.update({ where: { id: target.id }, data: { passwordHash: await bcrypt.hash(body.password, 12), failedLogins: 0, lockedUntil: null } }),
    db.refreshSession.deleteMany({ where: { userId: target.id } }),
  ]);
  await audit(req.user.id, 'user.password_reset', 'user', target.id);
  res.json({ ok: true });
}));

manageRoutes.get('/reports/agents', h(async (req, res) => {
  const today = dayKey();
  const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const from = parse(dateField.default(addDays(today, -29)), req.query.from);
  const to = parse(dateField.default(today), req.query.to);
  if (from > to) throw badRequest('The start date must be before the end date.');
  const range = { gte: startOfDay(from), lt: startOfDay(addDays(to, 1)) };
  const agents = await db.user.findMany({ where: { AND: [agentScope(req.user), { role: 'AGENT' }] }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true, dailyVisitTarget: true } });
  const ids = agents.map((a) => a.id);
  const [visits, shifts, tasks] = await Promise.all([
    db.visit.findMany({ where: { agentId: { in: ids }, status: 'COMPLETED', checkInAt: range }, select: { agentId: true, checkInAt: true, checkOutAt: true, orderCents: true, withinGeofence: true, customerId: true } }),
    db.shift.findMany({ where: { agentId: { in: ids }, startedAt: range }, select: { agentId: true, startedAt: true, endedAt: true, distanceKm: true } }),
    db.task.groupBy({ by: ['assignedToId'], where: { assignedToId: { in: ids }, status: 'DONE', completedAt: range }, _count: true }),
  ]);
  const rows = agents.map((a) => {
    const own = visits.filter((v) => v.agentId === a.id);
    const ownShifts = shifts.filter((s) => s.agentId === a.id);
    const worked = new Set(ownShifts.map((s) => dayKey(s.startedAt))).size;
    const minutes = own.reduce((sum, v) => sum + (v.checkOutAt ? (v.checkOutAt.getTime() - v.checkInAt.getTime()) / 60_000 : 0), 0);
    const expected = worked * a.dailyVisitTarget;
    return {
      agentId: a.id, agent: a.fullName, daysWorked: worked, visits: own.length,
      uniqueCustomers: new Set(own.map((v) => v.customerId)).size,
      verifiedPct: own.length ? Math.round((own.filter((v) => v.withinGeofence).length / own.length) * 100) : null,
      targetPct: expected ? Math.round((own.length / expected) * 100) : null,
      avgMinutes: own.length ? Math.round(minutes / own.length) : null,
      orderCents: own.reduce((sum, v) => sum + v.orderCents, 0),
      distanceKm: Math.round(ownShifts.reduce((sum, s) => sum + s.distanceKm, 0) * 10) / 10,
      tasksDone: tasks.find((t) => t.assignedToId === a.id)?._count ?? 0,
    };
  });
  res.json({ from, to, rows });
}));

manageRoutes.get('/audit', requireAdmin, h(async (req, res) => {
  const p = paging(req.query, 30);
  const [items, total] = await Promise.all([
    db.auditEntry.findMany({ skip: p.skip, take: p.take, orderBy: { createdAt: 'desc' }, include: { actor: { select: { fullName: true } } } }),
    db.auditEntry.count(),
  ]);
  res.json(listOf(items, total, p));
}));

manageRoutes.get('/settings', h(async (_req, res) => res.json(await getSettings())));

manageRoutes.put('/settings', requireAdmin, h(async (req, res) => {
  const body = parse(z.object({
    geofenceMeters: z.number().int().min(25).max(5000),
    pingSeconds: z.number().int().min(15).max(900),
    retentionDays: z.number().int().min(7).max(730),
    atRiskMultiplier: z.number().min(1).max(10),
  }).partial(), req.body);
  await db.$transaction(Object.entries(body).map(([key, value]) => db.setting.upsert({ where: { key }, create: { key, value: String(value) }, update: { value: String(value) } })));
  await audit(req.user.id, 'settings.updated', 'setting', null, body);
  res.json(await getSettings());
}));

