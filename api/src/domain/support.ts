import type { Prisma } from '@prisma/client';
import { db } from '../lib/db';
import type { Actor } from '../lib/auth';
import { forbidden, notFound } from '../lib/http';

export function audit(actorId: string | null, action: string, entity: string, entityId?: string | null, data?: Prisma.InputJsonValue) {
  return db.auditEntry.create({ data: { actorId, action, entity, entityId: entityId ?? null, data } });
}

export function notify(userId: string, kind: string, title: string, body: string, data?: Prisma.InputJsonValue) {
  return db.notification.create({ data: { userId, kind, title, body, data } });
}

/** Agents see their own and unassigned customers; managers see their team's; admins see all. */
export function customerScope(u: Actor): Prisma.CustomerWhereInput {
  if (u.role === 'ADMIN') return {};
  if (u.role === 'MANAGER') return { OR: [{ assignedToId: null }, { assignedToId: u.id }, { assignedTo: { managerId: u.id } }] };
  return { OR: [{ assignedToId: u.id }, { assignedToId: null }] };
}

/** Which users' field work this person may see. */
export function agentScope(u: Actor): Prisma.UserWhereInput {
  if (u.role === 'ADMIN') return {};
  if (u.role === 'MANAGER') return { OR: [{ managerId: u.id }, { id: u.id }] };
  return { id: u.id };
}

export async function findCustomer(u: Actor, id: string) {
  const customer = await db.customer.findFirst({ where: { id, ...customerScope(u) } });
  if (!customer) throw notFound('Customer not found.');
  return customer;
}

/** The named agent if the actor may direct their work. Defaults to the actor. */
export async function resolveAgent(u: Actor, agentId?: string | null) {
  const id = agentId ?? u.id;
  if (id !== u.id && u.role === 'AGENT') throw forbidden();
  const agent = await db.user.findFirst({ where: { id, isActive: true, ...agentScope(u) } });
  if (!agent) throw notFound('Agent not found.');
  return agent;
}
