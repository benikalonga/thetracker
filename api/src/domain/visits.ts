import type { Prisma, VisitOutcome } from '@prisma/client';
import { db } from '../lib/db';
import type { Actor } from '../lib/auth';
import { badRequest, conflict, HttpError, isUniqueViolation, notFound } from '../lib/http';
import { emitToSupervisors } from '../lib/realtime';
import { distanceM, isInsideGeofence } from './geo';
import { getSettings } from './settings';
import { dayKey, eventTime } from './time';
import { findCustomer, notify } from './support';

export const visitInclude = {
  customer: { select: { id: true, code: true, name: true, city: true, lat: true, lng: true } },
  agent: { select: { id: true, fullName: true } },
} satisfies Prisma.VisitInclude;

/** Starts the agent's shift if they have not, so a visit is never outside a shift. */
export async function ensureShift(agentId: string, at: Date, pos?: { lat: number; lng: number }, tx: Prisma.TransactionClient = db) {
  const open = await tx.shift.findUnique({ where: { openKey: agentId } });
  if (open) return open;
  try {
    return await tx.shift.create({ data: { agentId, openKey: agentId, startedAt: at, startLat: pos?.lat, startLng: pos?.lng } });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return (await tx.shift.findUnique({ where: { openKey: agentId } }))!;
  }
}

export interface CheckInInput {
  id?: string;
  customerId: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  overrideReason?: string | null;
  occurredAt?: Date;
}

export async function checkIn(user: Actor, input: CheckInInput) {
  if (input.id) {
    const replay = await db.visit.findUnique({ where: { id: input.id }, include: visitInclude });
    if (replay) {
      if (replay.agentId !== user.id) throw conflict('That visit id is already in use.');
      return replay;
    }
  }

  const customer = await findCustomer(user, input.customerId);
  if (customer.archivedAt) throw badRequest('This customer has been archived.');

  const settings = await getSettings();
  const radiusM = customer.geofenceM ?? settings.geofenceMeters;
  const distance = Math.round(distanceM(input, customer));
  const inside = isInsideGeofence(distance, radiusM, input.accuracy);
  const reason = input.overrideReason?.trim() || null;
  if (!inside && !reason) {
    throw new HttpError(422, `You are ${distance} m from this customer. Move within ${radiusM} m or give a reason.`, {
      code: 'OUTSIDE_GEOFENCE', distanceM: distance, radiusM,
    });
  }

  const at = eventTime(input.occurredAt);
  await ensureShift(user.id, at, input);
  let visit;
  try {
    visit = await db.visit.create({
      data: {
        id: input.id,
        customerId: customer.id,
        agentId: user.id,
        openKey: user.id,
        checkInAt: at,
        checkInLat: input.lat,
        checkInLng: input.lng,
        checkInDistanceM: distance,
        withinGeofence: inside,
        overrideReason: inside ? null : reason,
        review: inside ? 'NOT_NEEDED' : 'PENDING',
      },
      include: visitInclude,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    throw conflict('Finish your current visit before starting another one.', { code: 'VISIT_OPEN' });
  }

  emitToSupervisors(user.managerId, 'visit:started', { visitId: visit.id, agentId: user.id, customer: customer.name, withinGeofence: inside });
  if (!inside && user.managerId) {
    await notify(user.managerId, 'visit_flagged', 'Check-in outside the geofence', `${user.fullName} checked in ${distance} m from ${customer.name}: ${reason}`, { visitId: visit.id });
  }
  return visit;
}

export interface CheckOutInput {
  lat?: number | null;
  lng?: number | null;
  outcome: VisitOutcome;
  summary?: string | null;
  orderCents?: number;
  followUpAt?: Date | null;
  followUpTaskId?: string;
  occurredAt?: Date;
}

/** Outcomes that prove an active relationship with the customer. */
const WINS: VisitOutcome[] = ['ORDER_TAKEN', 'PAYMENT_COLLECTED', 'SERVICE_DONE'];

export async function checkOut(user: Actor, visitId: string, input: CheckOutInput) {
  const visit = await db.visit.findFirst({ where: { id: visitId, agentId: user.id }, include: visitInclude });
  if (!visit) throw notFound('Visit not found.');
  if (visit.status === 'COMPLETED') return visit; // a retried request
  if (visit.status === 'CANCELLED') throw conflict('This visit was cancelled.');
  if (input.outcome === 'FOLLOW_UP' && !input.followUpAt) throw badRequest('Choose when to follow up.');
  if (input.outcome !== 'ORDER_TAKEN' && input.outcome !== 'PAYMENT_COLLECTED' && input.orderCents) {
    throw badRequest('Only orders and payments can have a value.');
  }

  let at = eventTime(input.occurredAt);
  if (at < visit.checkInAt) at = visit.checkInAt;

  const updated = await db.$transaction(async (tx) => {
    const closed = await tx.visit.update({
      where: { id: visit.id },
      data: {
        status: 'COMPLETED',
        openKey: null,
        checkOutAt: at,
        checkOutLat: input.lat ?? null,
        checkOutLng: input.lng ?? null,
        outcome: input.outcome,
        summary: input.summary?.trim() || null,
        orderCents: input.orderCents ?? 0,
      },
      include: visitInclude,
    });

    const customer = await tx.customer.findUniqueOrThrow({ where: { id: visit.customerId } });
    const reached = input.outcome !== 'NOT_AVAILABLE';
    const nextStatus =
      WINS.includes(input.outcome) && (customer.status === 'LEAD' || customer.status === 'AT_RISK') ? 'ACTIVE'
      : reached && customer.status === 'AT_RISK' ? 'ACTIVE'
      : customer.status;
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        status: nextStatus,
        // A visit that found nobody does not reset how long the customer has gone unseen.
        lastVisitAt: reached && (!customer.lastVisitAt || customer.lastVisitAt < at) ? at : customer.lastVisitAt,
      },
    });

    await tx.planStop.updateMany({
      where: { customerId: visit.customerId, status: 'PENDING', plan: { agentId: user.id, date: dayKey(visit.checkInAt) } },
      data: { status: 'VISITED', visitId: visit.id },
    });

    if (input.followUpAt) {
      await tx.task.create({
        data: {
          id: input.followUpTaskId,
          title: `Follow up with ${customer.name}`,
          details: input.summary?.trim() || null,
          dueAt: input.followUpAt,
          customerId: customer.id,
          assignedToId: user.id,
          createdById: user.id,
        },
      });
    }
    return closed;
  });

  emitToSupervisors(user.managerId, 'visit:completed', { visitId: updated.id, agentId: user.id, outcome: updated.outcome });
  return updated;
}

export async function cancelVisit(user: Actor, visitId: string) {
  const visit = await db.visit.findFirst({ where: { id: visitId, agentId: user.id } });
  if (!visit) throw notFound('Visit not found.');
  if (visit.status === 'CANCELLED') return visit;
  if (visit.status !== 'IN_PROGRESS') throw conflict('Only a visit in progress can be cancelled.');
  return db.visit.update({ where: { id: visit.id }, data: { status: 'CANCELLED', openKey: null, review: 'NOT_NEEDED' } });
}
