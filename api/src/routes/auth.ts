import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../lib/db';
import { issueTokens, requireUser, rotateTokens } from '../lib/auth';
import { badRequest, h, HttpError, parse, sha256, unauthorized } from '../lib/http';
import { getSettings } from '../domain/settings';

export const authRoutes = Router();

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
// Compared against when the email is unknown, so both paths take the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const profileSelect = {
  id: true, fullName: true, email: true, phone: true, role: true, managerId: true, dailyVisitTarget: true,
  manager: { select: { fullName: true, phone: true } },
} as const;

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please wait a few minutes.' } });

authRoutes.post('/login', limiter, h(async (req, res) => {
  const body = parse(z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') }), req.body);
  const user = await db.user.findUnique({ where: { email: body.email } });
  if (user?.lockedUntil && user.lockedUntil > new Date()) throw new HttpError(423, `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`);

  const valid = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    if (user) {
      const failures = user.failedLogins + 1;
      await db.user.update({
        where: { id: user.id },
        data: failures >= MAX_FAILURES ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failures },
      });
    }
    throw unauthorized('Wrong email or password.');
  }
  if (!user.isActive) throw unauthorized('This account has been deactivated.');

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  const profile = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: profileSelect });
  res.json({ ...(await issueTokens(user.id)), profile });
}));

authRoutes.post('/refresh', h(async (req, res) => {
  const { refreshToken } = parse(z.object({ refreshToken: z.string().min(20) }), req.body);
  res.json(await rotateTokens(refreshToken));
}));

authRoutes.post('/logout', h(async (req, res) => {
  const { refreshToken } = parse(z.object({ refreshToken: z.string().min(1) }), req.body);
  await db.refreshSession.deleteMany({ where: { tokenHash: sha256(refreshToken) } });
  res.json({ ok: true });
}));

authRoutes.get('/me', requireUser, h(async (req, res) => {
  const profile = await db.user.findUniqueOrThrow({ where: { id: req.user.id }, select: profileSelect });
  const settings = await getSettings();
  res.json({ profile, settings: { geofenceMeters: settings.geofenceMeters, pingSeconds: settings.pingSeconds } });
}));

authRoutes.post('/password', requireUser, h(async (req, res) => {
  const body = parse(z.object({ current: z.string().min(1), next: z.string().min(10, 'Use at least 10 characters.').max(100) }), req.body);
  const user = await db.user.findUniqueOrThrow({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(body.current, user.passwordHash))) throw badRequest('Your current password is not correct.');
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.next, 12) } }),
    db.refreshSession.deleteMany({ where: { userId: user.id } }),
  ]);
  res.json(await issueTokens(user.id));
}));
