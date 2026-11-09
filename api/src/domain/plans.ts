import type { Prisma } from '@prisma/client';
import { db } from '../lib/db';
import { optimizeRoute, pathLengthM, type Point } from './geo';

export const planInclude = {
  stops: {
    orderBy: { position: 'asc' },
    include: { customer: { select: { id: true, code: true, name: true, city: true, address: true, lat: true, lng: true, status: true, priority: true, phone: true } } },
  },
} satisfies Prisma.DayPlanInclude;

export type FullPlan = Prisma.DayPlanGetPayload<{ include: typeof planInclude }>;

/** Pending stops go after the finished ones; only the pending part of the day can be reordered. */
export function reorderPending(plan: FullPlan, start: Point | null) {
  const done = plan.stops.filter((s) => s.status !== 'PENDING');
  const pending = plan.stops.filter((s) => s.status === 'PENDING').map((s) => ({ ...s, lat: s.customer.lat, lng: s.customer.lng }));
  const before = pathLengthM(start ? [start, ...pending] : pending);
  const ordered = optimizeRoute(start, pending);
  const after = pathLengthM(start ? [start, ...ordered] : ordered);
  return { order: [...done, ...ordered].map((s) => s.id), beforeKm: before / 1000, afterKm: after / 1000 };
}

export async function applyOrder(order: string[]) {
  await db.$transaction(order.map((id, position) => db.planStop.update({ where: { id }, data: { position } })));
}

export const planSummary = (plan: FullPlan) => ({
  total: plan.stops.length,
  visited: plan.stops.filter((s) => s.status === 'VISITED').length,
  skipped: plan.stops.filter((s) => s.status === 'SKIPPED').length,
});
