import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../lib/db';
import { requireManager, requireUser } from '../lib/auth';
import { badRequest, conflict, forbidden, h, listOf, paging, parse, reference } from '../lib/http';
import { audit, customerScope, findCustomer, notify, resolveAgent } from '../domain/support';
import { visitInclude } from '../domain/visits';

export const customerRoutes = Router();
customerRoutes.use(requireUser);

const STATUSES = ['LEAD', 'ACTIVE', 'AT_RISK', 'INACTIVE'] as const;
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;
const optional = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

const fields = {
  name: z.string().trim().min(2, 'Enter the customer name.').max(160),
  contactName: optional(120),
  phone: optional(32),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').or(z.literal('')).nullish().transform((v) => v || null),
  address: optional(255),
  city: optional(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  segment: optional(60),
  tags: z.array(z.string().trim().min(1).max(30)).max(12),
  geofenceM: z.number().int().min(25).max(5000).nullable(),
  visitEveryDays: z.number().int().min(1).max(365),
};

const createSchema = z.object({
  id: z.string().uuid().optional(),
  ...fields,
  status: fields.status.default('LEAD'),
  priority: fields.priority.default('NORMAL'),
  tags: fields.tags.default([]),
  geofenceM: fields.geofenceM.optional(),
  visitEveryDays: fields.visitEveryDays.default(30),
  assignedToId: z.string().uuid().nullish(),
});
const updateSchema = z.object(fields).partial().extend({ assignedToId: z.string().uuid().nullish() });

const shape = <T extends { favorites?: unknown[] }>(row: T) => {
  const { favorites, ...rest } = row;
  return { ...rest, isFavorite: !!favorites?.length };
};
const listInclude = (userId: string) => ({
  favorites: { where: { userId }, select: { userId: true } },
  assignedTo: { select: { id: true, fullName: true } },
});

customerRoutes.get('/', h(async (req, res) => {
  const p = paging(req.query, 25);
  const { q, status, priority, agentId, archived, all } = req.query as Record<string, string | undefined>;
  const and: Prisma.CustomerWhereInput[] = [customerScope(req.user), { archivedAt: archived === '1' ? { not: null } : null }];
  if (q) and.push({ OR: [{ name: { contains: q } }, { code: { contains: q } }, { city: { contains: q } }, { phone: { contains: q } }, { contactName: { contains: q } }] });
  if (status && (STATUSES as readonly string[]).includes(status)) and.push({ status: status as (typeof STATUSES)[number] });
  if (priority && (PRIORITIES as readonly string[]).includes(priority)) and.push({ priority: priority as (typeof PRIORITIES)[number] });
  if (agentId) and.push(agentId === 'none' ? { assignedToId: null } : { assignedToId: agentId });
  const where = { AND: and };
  // The phone keeps a full copy for offline use and sorts it by distance itself.
  const window = all === '1' ? { skip: 0, take: 3000 } : { skip: p.skip, take: p.take };
  const [rows, total] = await Promise.all([
    db.customer.findMany({ where, ...window, orderBy: { name: 'asc' }, include: listInclude(req.user.id) }),
    db.customer.count({ where }),
  ]);
  res.json(listOf(rows.map(shape), total, p));
}));

customerRoutes.post('/', h(async (req, res) => {
  const { assignedToId, ...body } = parse(createSchema, req.body);
  if (body.id) {
    const replay = await db.customer.findUnique({ where: { id: body.id }, include: listInclude(req.user.id) });
    if (replay) {
      if (replay.createdById !== req.user.id) throw conflict('That customer id is already in use.');
      return res.json(shape(replay));
    }
  }
  let owner: string | null = req.user.id;
  if (req.user.role !== 'AGENT' && assignedToId !== undefined) owner = assignedToId ? (await resolveAgent(req.user, assignedToId)).id : null;
  else if (assignedToId && assignedToId !== req.user.id) throw forbidden('Only a manager can assign customers to someone else.');
  const created = await db.customer.create({
    data: { ...body, code: reference('C'), assignedToId: owner, createdById: req.user.id },
    include: listInclude(req.user.id),
  });
  await audit(req.user.id, 'customer.created', 'customer', created.id, { name: created.name });
  res.status(201).json(shape(created));
}));

customerRoutes.post('/bulk-assign', requireManager, h(async (req, res) => {
  const body = parse(z.object({ ids: z.array(z.string().uuid()).min(1).max(500), agentId: z.string().uuid().nullable() }), req.body);
  const agent = body.agentId ? await resolveAgent(req.user, body.agentId) : null;
  const result = await db.customer.updateMany({ where: { AND: [{ id: { in: body.ids } }, customerScope(req.user)] }, data: { assignedToId: agent?.id ?? null } });
  if (agent && agent.id !== req.user.id && result.count) await notify(agent.id, 'customers_assigned', 'New customers assigned', `${req.user.fullName} assigned you ${result.count} customer${result.count === 1 ? '' : 's'}.`);
  await audit(req.user.id, 'customer.bulk_assigned', 'customer', null, { count: result.count, agentId: agent?.id ?? null });
  res.json({ updated: result.count });
}));

const CSV_COLUMNS = ['code', 'name', 'contactName', 'phone', 'email', 'address', 'city', 'lat', 'lng', 'status', 'priority', 'segment', 'visitEveryDays', 'lastVisitAt'] as const;

/** Quote a CSV value and stop spreadsheets from running it as a formula. */
function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

customerRoutes.get('/export.csv', requireManager, h(async (req, res) => {
  const rows = await db.customer.findMany({ where: { AND: [customerScope(req.user), { archivedAt: null }] }, orderBy: { name: 'asc' }, take: 20000 });
  const lines = [CSV_COLUMNS.join(','), ...rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(','))];
  await audit(req.user.id, 'customer.exported', 'customer', null, { count: rows.length });
  res.type('text/csv').attachment('customers.csv').send(lines.join('\n'));
}));

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

customerRoutes.post('/import', requireManager, h(async (req, res) => {
  const { csv, agentId } = parse(z.object({ csv: z.string().min(1).max(4_000_000), agentId: z.string().uuid().nullish() }), req.body);
  const owner = agentId ? (await resolveAgent(req.user, agentId)).id : null;
  const [header, ...rows] = parseCsv(csv);
  if (!header) throw badRequest('The file is empty.');
  const names = header.map((h) => h.trim().toLowerCase());
  for (const need of ['name', 'lat', 'lng']) if (!names.includes(need)) throw badRequest(`The file needs a "${need}" column.`);
  if (rows.length > 5000) throw badRequest('Import at most 5,000 rows at a time.');
  const rowSchema = z.object({ ...fields, status: fields.status.catch('LEAD'), priority: fields.priority.catch('NORMAL'), visitEveryDays: fields.visitEveryDays.catch(30) }).pick({ name: true, contactName: true, phone: true, email: true, address: true, city: true, lat: true, lng: true, status: true, priority: true, segment: true, visitEveryDays: true });

  const errors: { row: number; message: string }[] = [];
  const data: Prisma.CustomerCreateManyInput[] = [];
  rows.forEach((cells, i) => {
    const raw = Object.fromEntries(names.map((n, c) => [n, cells[c]?.trim() ?? '']));
    const parsed = rowSchema.safeParse({
      name: raw.name, contactName: raw.contactname, phone: raw.phone, email: raw.email, address: raw.address, city: raw.city,
      lat: raw.lat === '' ? NaN : Number(raw.lat), lng: raw.lng === '' ? NaN : Number(raw.lng),
      status: raw.status?.toUpperCase(), priority: raw.priority?.toUpperCase(), segment: raw.segment, visitEveryDays: Number(raw.visiteverydays) || undefined,
    });
    if (!parsed.success) errors.push({ row: i + 2, message: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` });
    else data.push({ ...parsed.data, code: reference('C'), assignedToId: owner, createdById: req.user.id });
  });
  if (data.length) await db.customer.createMany({ data });
  await audit(req.user.id, 'customer.imported', 'customer', null, { imported: data.length, failed: errors.length });
  res.json({ imported: data.length, failed: errors.length, errors: errors.slice(0, 50) });
}));

customerRoutes.get('/:id', h(async (req, res) => {
  await findCustomer(req.user, req.params.id);
  const customer = await db.customer.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      ...listInclude(req.user.id),
      notes: { orderBy: { createdAt: 'desc' }, take: 50, include: { author: { select: { id: true, fullName: true } } } },
      visits: { orderBy: { checkInAt: 'desc' }, take: 30, include: visitInclude },
      tasks: { where: { status: 'OPEN' }, orderBy: { dueAt: 'asc' }, take: 30 },
    },
  });
  const totals = await db.visit.aggregate({ where: { customerId: customer.id, status: 'COMPLETED' }, _count: true, _sum: { orderCents: true } });
  res.json({ ...shape(customer), totals: { visits: totals._count, orderCents: totals._sum.orderCents ?? 0 } });
}));

customerRoutes.patch('/:id', h(async (req, res) => {
  const existing = await findCustomer(req.user, req.params.id);
  const { assignedToId, ...body } = parse(updateSchema, req.body);
  const data: Prisma.CustomerUncheckedUpdateInput = { ...body };
  if (assignedToId !== undefined && assignedToId !== existing.assignedToId) {
    if (req.user.role === 'AGENT') throw forbidden('Only a manager can reassign customers.');
    const agent = assignedToId ? await resolveAgent(req.user, assignedToId) : null;
    data.assignedToId = agent?.id ?? null;
    if (agent && agent.id !== req.user.id) await notify(agent.id, 'customers_assigned', 'New customer assigned', `${req.user.fullName} assigned you ${existing.name}.`, { customerId: existing.id });
  }
  const updated = await db.customer.update({ where: { id: existing.id }, data, include: listInclude(req.user.id) });
  await audit(req.user.id, 'customer.updated', 'customer', existing.id, { fields: Object.keys(data) });
  res.json(shape(updated));
}));

customerRoutes.post('/:id/archive', requireManager, h(async (req, res) => {
  const existing = await findCustomer(req.user, req.params.id);
  const archive = req.body?.archive !== false;
  await db.customer.update({ where: { id: existing.id }, data: { archivedAt: archive ? new Date() : null } });
  await audit(req.user.id, archive ? 'customer.archived' : 'customer.restored', 'customer', existing.id);
  res.json({ ok: true });
}));

customerRoutes.put('/:id/favorite', h(async (req, res) => {
  const { id } = await findCustomer(req.user, req.params.id);
  await db.favorite.upsert({ where: { userId_customerId: { userId: req.user.id, customerId: id } }, create: { userId: req.user.id, customerId: id }, update: {} });
  res.json({ isFavorite: true });
}));

customerRoutes.delete('/:id/favorite', h(async (req, res) => {
  const { id } = await findCustomer(req.user, req.params.id);
  await db.favorite.deleteMany({ where: { userId: req.user.id, customerId: id } });
  res.json({ isFavorite: false });
}));

customerRoutes.post('/:id/notes', h(async (req, res) => {
  const { id: customerId } = await findCustomer(req.user, req.params.id);
  const body = parse(z.object({ id: z.string().uuid().optional(), body: z.string().trim().min(1, 'Write a note first.').max(4000) }), req.body);
  if (body.id) {
    const replay = await db.note.findUnique({ where: { id: body.id } });
    if (replay) {
      if (replay.authorId !== req.user.id) throw conflict('That note id is already in use.');
      return res.json(replay);
    }
  }
  const note = await db.note.create({ data: { id: body.id, customerId, authorId: req.user.id, body: body.body }, include: { author: { select: { id: true, fullName: true } } } });
  res.status(201).json(note);
}));
