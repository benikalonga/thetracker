import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';
import { requireUser } from '../lib/auth';
import { badRequest, conflict, h, notFound, parse } from '../lib/http';
import { agentScope, customerScope, notify, resolveAgent } from '../domain/support';
import { applyOrder, planInclude, planSummary, reorderPending } from '../domain/plans';
import { dayKey } from '../domain/time';

export const planRoutes = Router();
planRoutes.use(requireUser);

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');
const position = { lat: z.number().min(-90).max(90).nullish(), lng: z.number().min(-180).max(180).nullish() };

async function findPlan(user: Express.Request['user'], id: string) {
  const plan = await db.dayPlan.findFirst({ where: { id, agent: agentScope(user) }, include: planInclude });
  if (!plan) throw notFound('Plan not found.');
  return plan;
}

planRoutes.get('/', h(async (req, res) => {
  const date = parse(dateField.default(dayKey()), req.query.date);
  const agent = await resolveAgent(req.user, req.query.agentId as string | undefined);
  const plan = await db.dayPlan.findUnique({ where: { agentId_date: { agentId: agent.id, date } }, include: planInclude });
  res.json(plan ? { ...plan, summary: planSummary(plan) } : null);
}));

/** Replace the not-yet-visited part of a day. Finished stops stay as history. */
planRoutes.put('/', h(async (req, res) => {
  const body = parse(z.object({
    agentId: z.string().uuid().optional(),
    date: dateField,
    customerIds: z.array(z.string().uuid()).max(60),
    optimize: z.boolean().default(false),
    ...position,
  }), req.body);
  if (body.date < dayKey()) throw badRequest('Plans for past days cannot be changed.');
  const agent = await resolveAgent(req.user, body.agentId);
  const ids = [...new Set(body.customerIds)];
  const allowed = await db.customer.count({ where: { AND: [{ id: { in: ids } }, { archivedAt: null }, customerScope(req.user)] } });
  if (allowed !== ids.length) throw badRequest('One or more customers are not available.');

  const plan = await db.$transaction(async (tx) => {
    const current = await tx.dayPlan.upsert({ where: { agentId_date: { agentId: agent.id, date: body.date } }, create: { agentId: agent.id, date: body.date }, update: {} });
    await tx.planStop.deleteMany({ where: { planId: current.id, status: 'PENDING' } });
    const finished = await tx.planStop.findMany({ where: { planId: current.id }, select: { customerId: true } });
    const done = new Set(finished.map((f) => f.customerId));
    const fresh = ids.filter((id) => !done.has(id));
    await tx.planStop.createMany({ data: fresh.map((customerId, i) => ({ planId: current.id, customerId, position: finished.length + i })) });
    return tx.dayPlan.findUniqueOrThrow({ where: { id: current.id }, include: planInclude });
  });

  let result = plan;
  if (body.optimize) {
    const start = body.lat != null && body.lng != null ? { lat: body.lat, lng: body.lng } : null;
    await applyOrder(reorderPending(plan, start).order);
    result = await findPlan(req.user, plan.id);
  }
  if (agent.id !== req.user.id) await notify(agent.id, 'plan_assigned', 'Your route was updated', `${req.user.fullName} set ${ids.length} stop${ids.length === 1 ? '' : 's'} for ${body.date}.`, { date: body.date });
  res.json({ ...result, summary: planSummary(result) });
}));

planRoutes.post('/:id/optimize', h(async (req, res) => {
  const body = parse(z.object(position), req.body ?? {});
  const plan = await findPlan(req.user, req.params.id);
  const start = body.lat != null && body.lng != null ? { lat: body.lat, lng: body.lng } : null;
  const { order, beforeKm, afterKm } = reorderPending(plan, start);
  await applyOrder(order);
  const updated = await findPlan(req.user, plan.id);
  res.json({ plan: { ...updated, summary: planSummary(updated) }, beforeKm, afterKm });
}));

planRoutes.post('/stops/:id/skip', h(async (req, res) => {
  const body = parse(z.object({ reason: z.string().trim().min(2, 'Say why this stop is skipped.').max(255) }), req.body);
  const stop = await db.planStop.findFirst({ where: { id: req.params.id, plan: { agent: agentScope(req.user) } } });
  if (!stop) throw notFound('Stop not found.');
  if (stop.status === 'VISITED') throw conflict('This stop has already been visited.');
  res.json(await db.planStop.update({ where: { id: stop.id }, data: { status: 'SKIPPED', skipReason: body.reason } }));
}));

planRoutes.post('/stops/:id/restore', h(async (req, res) => {
  const stop = await db.planStop.findFirst({ where: { id: req.params.id, plan: { agent: agentScope(req.user) } } });
  if (!stop) throw notFound('Stop not found.');
  if (stop.status !== 'SKIPPED') throw conflict('Only a skipped stop can be restored.');
  res.json(await db.planStop.update({ where: { id: stop.id }, data: { status: 'PENDING', skipReason: null } }));
}));
