import compression from 'compression';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { ZodError } from 'zod';
import { config } from './lib/config';
import { HttpError, isUniqueViolation } from './lib/http';
import { agentRoutes } from './routes/agent';
import { authRoutes } from './routes/auth';
import { customerRoutes } from './routes/customers';
import { manageRoutes } from './routes/manage';
import { planRoutes } from './routes/plans';
import { taskRoutes } from './routes/tasks';
import { visitRoutes } from './routes/visits';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  // The mobile app sends no Origin header, so CORS only applies to the console.
  app.use(cors({ origin: config.consoleOrigins }));
  app.use(compression());
  app.use(express.json({ limit: '5mb' }));
  if (config.nodeEnv !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'thetracker-api' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } }));
  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/visits', visitRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/agent', agentRoutes);
  app.use('/api/manage', manageRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request.' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    if (isUniqueViolation(err)) return res.status(409).json({ error: 'That record already exists.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side.' });
  };
  app.use(onError);
  return app;
}
