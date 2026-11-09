import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { config } from './config';
import { db } from './db';
import { forbidden, sha256, unauthorized } from './http';

export interface Actor {
  id: string;
  role: Role;
  fullName: string;
  managerId: string | null;
  dailyVisitTarget: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: Actor;
    }
  }
}

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 30;

export function verifyAccess(token?: string): { sub: string } | null {
  try {
    return token ? (jwt.verify(token, config.accessSecret) as { sub: string }) : null;
  } catch {
    return null;
  }
}

export async function issueTokens(userId: string) {
  const accessToken = jwt.sign({ sub: userId }, config.accessSecret, { expiresIn: ACCESS_TTL });
  const refreshToken = crypto.randomBytes(48).toString('hex');
  await db.refreshSession.create({
    data: { tokenHash: sha256(refreshToken), userId, expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5) },
  });
  return { accessToken, refreshToken };
}

/** Exchange a refresh token for a new pair. Each token works exactly once. */
export async function rotateTokens(refreshToken: string) {
  const session = await db.refreshSession.findUnique({ where: { tokenHash: sha256(refreshToken) } });
  if (!session) throw unauthorized('Your session has expired.');
  const removed = await db.refreshSession.deleteMany({ where: { id: session.id } });
  if (removed.count !== 1 || session.expiresAt < new Date()) throw unauthorized('Your session has expired.');
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user?.isActive) throw unauthorized();
  return issueTokens(user.id);
}

export const requireUser: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    const claims = verifyAccess(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!claims) throw unauthorized();
    // Loaded on every request so deactivation and role changes apply immediately.
    const user = await db.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, fullName: true, managerId: true, dailyVisitTarget: true, isActive: true },
    });
    if (!user?.isActive) throw unauthorized();
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireManager: RequestHandler = (req, _res, next) =>
  next(req.user.role === 'AGENT' ? forbidden() : undefined);

export const requireAdmin: RequestHandler = (req, _res, next) =>
  next(req.user.role === 'ADMIN' ? undefined : forbidden());
