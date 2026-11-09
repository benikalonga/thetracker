import 'dotenv/config';
import bcrypt from 'bcryptjs';
import type { CustomerStatus, Priority, VisitOutcome } from '@prisma/client';
import { db } from './lib/db';
import { reference } from './lib/http';
import { addDays, dayKey, startOfDay } from './domain/time';
import { distanceM } from './domain/geo';

/** Demo data around a fictional city centre. Needs SEED_PASSWORD in the environment. */
const CENTER = { lat: 0, lng: 0 };
const NAMES = Array.from({ length: 24 }, (_, i) => `YOUR_COMPANY_NAME_${i + 1}`);
const CONTACTS = Array.from({ length: 6 }, (_, i) => `YOUR_CONTACT_NAME_${i + 1}`);
const demoEmail = (name: string) => `YOUR_${name}_EMAIL@fakeemail.com`.toLowerCase();
const SEGMENTS = ['Retail', 'Pharmacy', 'Food service', 'Automotive', 'Services'];
const OUTCOMES: VisitOutcome[] = ['ORDER_TAKEN', 'ORDER_TAKEN', 'PAYMENT_COLLECTED', 'SERVICE_DONE', 'FOLLOW_UP', 'NOT_AVAILABLE'];

let seed = 42;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10) throw new Error('Set SEED_PASSWORD (10+ characters) before seeding.');
  if (await db.user.count()) throw new Error('The database already has users; refusing to seed.');
  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.create({ data: { fullName: 'YOUR_ADMIN_NAME', email: demoEmail('ADMIN'), passwordHash, role: 'ADMIN' } });
  const manager = await db.user.create({ data: { fullName: 'YOUR_MANAGER_NAME', email: demoEmail('MANAGER'), phone: 'YOUR_PHONE_NUMBER', passwordHash, role: 'MANAGER' } });
  const agents = await Promise.all(
    [['YOUR_AGENT_NAME', demoEmail('AGENT')], ['YOUR_AGENT_NAME_2', demoEmail('AGENT_2')], ['YOUR_AGENT_NAME_3', demoEmail('AGENT_3')]].map(([fullName, email], i) =>
      db.user.create({ data: { fullName, email, phone: `YOUR_PHONE_NUMBER_${i + 1}`, passwordHash, role: 'AGENT', managerId: manager.id, dailyVisitTarget: 6 } })),
  );

  const statuses: CustomerStatus[] = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'LEAD', 'AT_RISK', 'INACTIVE'];
  const priorities: Priority[] = ['NORMAL', 'NORMAL', 'HIGH', 'LOW'];
  const customers = await Promise.all(NAMES.map((name, i) =>
    db.customer.create({
      data: {
        code: reference('C'), name, contactName: pick(CONTACTS), phone: `YOUR_CUSTOMER_PHONE_NUMBER_${i + 1}`,
        email: demoEmail(`CUSTOMER_${i + 1}`),
        address: `YOUR_ADDRESS_${i + 1}`, city: 'YOUR_CITY',
        lat: CENTER.lat + (rand() - 0.5) * 0.09, lng: CENTER.lng + (rand() - 0.5) * 0.09,
        status: pick(statuses), priority: pick(priorities), segment: pick(SEGMENTS), tags: [],
        assignedToId: agents[i % 3].id, createdById: manager.id, visitEveryDays: pick([7, 14, 30]),
      },
    })));

  const today = dayKey();
  for (let day = 13; day >= 1; day--) {
    const key = addDays(today, -day);
    for (const agent of agents) {
      const own = customers.filter((c) => c.assignedToId === agent.id);
      const startedAt = new Date(startOfDay(key).getTime() + 8 * 3_600_000);
      const count = 3 + Math.floor(rand() * 5);
      await db.shift.create({ data: { agentId: agent.id, startedAt, endedAt: new Date(startedAt.getTime() + 8 * 3_600_000), distanceKm: 12 + rand() * 30 } });
      for (let v = 0; v < count; v++) {
        const c = pick(own);
        const inAt = new Date(startedAt.getTime() + v * 75 * 60_000);
        const outcome = pick(OUTCOMES);
        const lat = c.lat + (rand() - 0.5) * 0.0008;
        const lng = c.lng + (rand() - 0.5) * 0.0008;
        const dist = Math.round(distanceM({ lat, lng }, c));
        await db.visit.create({
          data: {
            customerId: c.id, agentId: agent.id, status: 'COMPLETED', checkInAt: inAt, checkInLat: lat, checkInLng: lng, checkInDistanceM: dist, withinGeofence: true,
            checkOutAt: new Date(inAt.getTime() + (10 + rand() * 30) * 60_000), outcome, summary: 'Routine call.',
            orderCents: outcome === 'ORDER_TAKEN' || outcome === 'PAYMENT_COLLECTED' ? Math.round(2000 + rand() * 40000) : 0,
          },
        });
        await db.customer.update({ where: { id: c.id }, data: { lastVisitAt: inAt } });
      }
    }
  }

  const agent = agents[0];
  const stops = customers.filter((c) => c.assignedToId === agent.id).slice(0, 6);
  await db.dayPlan.create({ data: { agentId: agent.id, date: today, stops: { create: stops.map((c, position) => ({ customerId: c.id, position })) } } });
  await db.task.create({ data: { title: 'Collect signed supply agreement', dueAt: new Date(), priority: 'HIGH', customerId: stops[0].id, assignedToId: agent.id, createdById: manager.id } });
  await db.task.create({ data: { title: 'Confirm delivery window', dueAt: new Date(Date.now() - 864e5), customerId: stops[1].id, assignedToId: agent.id, createdById: agent.id } });
  await db.notification.create({ data: { userId: agent.id, kind: 'plan_assigned', title: 'Your route is ready', body: `${manager.fullName} planned ${stops.length} stops for today.` } });
  console.log(`✓ Seeded ${customers.length} customers and ${agents.length} agents. Sign in as ${demoEmail('AGENT')} or ${demoEmail('MANAGER')}.`);
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
}).finally(() => db.$disconnect());
