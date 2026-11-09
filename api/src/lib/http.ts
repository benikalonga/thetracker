import crypto from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const unauthorized = (m = 'Please sign in again.') => new HttpError(401, m);
export const forbidden = (m = 'You do not have access to this.') => new HttpError(403, m);
export const notFound = (m = 'Not found.') => new HttpError(404, m);
export const conflict = (m: string, extra?: Record<string, unknown>) => new HttpError(409, m, extra);

export const h =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const parse = <S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> => schema.parse(value);

export function paging(query: Request['query'], defaultLimit = 25) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export const listOf = <T>(items: T[], total: number, p: { page: number; limit: number }) => ({
  items,
  total,
  page: p.page,
  pages: Math.max(1, Math.ceil(total / p.limit)),
});

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function reference(prefix: string, length = 7): string {
  let out = '';
  for (const byte of crypto.randomBytes(length)) out += ALPHABET[byte % ALPHABET.length];
  return `${prefix}-${out}`;
}

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === 'P2002';
