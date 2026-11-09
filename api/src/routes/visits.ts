import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../lib/db';
import { requireManager, requireUser } from '../lib/auth';
import { h, listOf, notFound, paging, parse, conflict } from '../lib/http';
import { agentScope, audit, notify } from '../domain/support';
import { cancelVisit, checkIn, checkOut, visitInclude } from '../domain/visits';
import { dayRange } from '../domain/time';

export const visitRoutes = Router();
visitRoutes.use(requireUser);

const when = z.coerce.date().optional();
const OUTCOMES = ['ORDER_TAKEN', 'PAYMENT_COLLECTED', 'SERVICE_DONE', 'FOLLOW_UP', 'NOT_AVAILABLE', 'NOT_INTERESTED', 'OTHER'] as const;

visitRoutes.get('/', h(async (req, res) => {
  const p = paging(req.query, 25);
  const { agentId, customerId, review, date, status } = req.query as Record<string, string | undefined>;
  const and: Prisma.VisitWhereInput[] = [{ agent: agentScope(req.user) }];
  if (agentId) and.push({ agentId });
  if (customerId) and.push({ customerId });
  if (review === 'PENDING' || review === 'APPROVED' || review === 'REJECTED') and.push({ review });
  if (status === 'IN_PROGRESS' || status === 'COMPLETED' || status === 'CANCELLED') and.push({ status });
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) and.push({ checkInAt: dayRange(date) });
  const where = { AND: and };
  const [items, total] = await Promise.all([
    db.visit.findMany({ where, ...{ skip: p.skip, take: p.take }, orderBy: { checkInAt: 'desc' }, include: visitInclude }),
    db.visit.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

visitRoutes.post('/check-in', h(async (req, res) => {
  const body = parse(z.object({
    id: z.string().uuid().optional(),
    customerId: z.string().uuid(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().nullish(),
    overrideReason: z.string().trim().max(255).nullish(),
    occurredAt: when,
  }), req.body);
  res.status(201).json(await checkIn(req.user, body));
}));

visitRoutes.post('/:id/check-out', h(async (req, res) => {
  const body = parse(z.object({
    lat: z.number().min(-90).max(90).nullish(),
    lng: z.number().min(-180).max(180).nullish(),
    outcome: z.enum(OUTCOMES),
    summary: z.string().trim().max(4000).nullish(),
    orderCents: z.number().int().min(0).max(100_000_000_00).optional(),
    followUpAt: z.coerce.date().nullish(),
    followUpTaskId: z.string().uuid().optional(),
    occurredAt: when,
  }), req.body);
  res.json(await checkOut(req.user, req.params.id, body));
}));

visitRoutes.post('/:id/cancel', h(async (req, res) => {
  res.json(await cancelVisit(req.user, req.params.id));
}));

visitRoutes.post('/:id/review', requireManager, h(async (req, res) => {
  const body = parse(z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(255).nullish() }), req.body);
  const visit = await db.visit.findFirst({ where: { id: req.params.id, agent: agentScope(req.user) }, include: visitInclude });
  if (!visit) throw notFound('Visit not found.');
  if (visit.review !== 'PENDING') throw conflict('This visit is not waiting for a review.');
  const updated = await db.visit.update({
    where: { id: visit.id },
    data: { review: body.decision, reviewNote: body.note ?? null, reviewedById: req.user.id, reviewedAt: new Date() },
    include: visitInclude,
  });
  await notify(visit.agentId, 'visit_reviewed', `Check-in ${body.decision.toLowerCase()}`, `Your check-in at ${visit.customer.name} was ${body.decision.toLowerCase()}${body.note ? `: ${body.note}` : '.'}`, { visitId: visit.id });
  await audit(req.user.id, 'visit.reviewed', 'visit', visit.id, { decision: body.decision });
  res.json(updated);
}));
