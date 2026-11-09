import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../lib/db';
import { requireUser } from '../lib/auth';
import { conflict, h, listOf, notFound, paging, parse } from '../lib/http';
import { agentScope, findCustomer, notify, resolveAgent } from '../domain/support';

export const taskRoutes = Router();
taskRoutes.use(requireUser);

const include = {
  customer: { select: { id: true, name: true, city: true, lat: true, lng: true } },
  assignedTo: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.TaskInclude;

const scoped = (user: Express.Request['user'], id: string) =>
  db.task.findFirst({ where: { id, assignedTo: agentScope(user) } });

taskRoutes.get('/', h(async (req, res) => {
  const p = paging(req.query, 50);
  const { status, agentId, all } = req.query as Record<string, string | undefined>;
  const where: Prisma.TaskWhereInput = {
    assignedTo: agentScope(req.user),
    ...(agentId ? { assignedToId: agentId } : {}),
    ...(status === 'OPEN' || status === 'DONE' || status === 'CANCELLED' ? { status } : {}),
  };
  const window = all === '1' ? { skip: 0, take: 1000 } : { skip: p.skip, take: p.take };
  const [items, total] = await Promise.all([
    db.task.findMany({ where, ...window, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], include }),
    db.task.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

taskRoutes.post('/', h(async (req, res) => {
  const body = parse(z.object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(2, 'Give the task a title.').max(160),
    details: z.string().trim().max(4000).nullish(),
    dueAt: z.coerce.date(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
    customerId: z.string().uuid().nullish(),
    assignedToId: z.string().uuid().nullish(),
  }), req.body);
  if (body.id) {
    const replay = await db.task.findUnique({ where: { id: body.id }, include });
    if (replay) {
      if (replay.createdById !== req.user.id) throw conflict('That task id is already in use.');
      return res.json(replay);
    }
  }
  const assignee = await resolveAgent(req.user, body.assignedToId);
  if (body.customerId) await findCustomer(req.user, body.customerId);
  const task = await db.task.create({
    data: { id: body.id, title: body.title, details: body.details || null, dueAt: body.dueAt, priority: body.priority, customerId: body.customerId ?? null, assignedToId: assignee.id, createdById: req.user.id },
    include,
  });
  if (assignee.id !== req.user.id) await notify(assignee.id, 'task_assigned', 'New task', `${req.user.fullName}: ${task.title}`, { taskId: task.id });
  res.status(201).json(task);
}));

taskRoutes.patch('/:id', h(async (req, res) => {
  const task = await scoped(req.user, req.params.id);
  if (!task) throw notFound('Task not found.');
  const body = parse(z.object({
    title: z.string().trim().min(2).max(160), details: z.string().trim().max(4000).nullable(),
    dueAt: z.coerce.date(), priority: z.enum(['LOW', 'NORMAL', 'HIGH']),
  }).partial(), req.body);
  res.json(await db.task.update({ where: { id: task.id }, data: { ...body, remindedAt: body.dueAt ? null : undefined }, include }));
}));

/** Setting the same status twice is harmless, so these are safe to replay from the offline queue. */
const setStatus = (status: 'OPEN' | 'DONE' | 'CANCELLED') =>
  h(async (req, res) => {
    const task = await scoped(req.user, req.params.id);
    if (!task) throw notFound('Task not found.');
    if (task.status === status) return res.json(await db.task.findUniqueOrThrow({ where: { id: task.id }, include }));
    res.json(await db.task.update({ where: { id: task.id }, data: { status, completedAt: status === 'DONE' ? new Date() : null }, include }));
  });

taskRoutes.post('/:id/complete', setStatus('DONE'));
taskRoutes.post('/:id/reopen', setStatus('OPEN'));
taskRoutes.post('/:id/cancel', setStatus('CANCELLED'));
