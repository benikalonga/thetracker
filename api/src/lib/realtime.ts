import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { db } from './db';
import { verifyAccess } from './auth';

let io: Server | null = null;

/** Live updates are for the console only; the mobile app talks plain HTTP so it survives poor networks. */
export function attachRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: config.consoleOrigins } });
  io.use(async (socket, next) => {
    const claims = verifyAccess(socket.handshake.auth?.token);
    if (!claims) return next(new Error('unauthorized'));
    const user = await db.user.findUnique({ where: { id: claims.sub } });
    if (!user?.isActive || user.role === 'AGENT') return next(new Error('forbidden'));
    socket.join(user.role === 'ADMIN' ? 'admins' : `manager:${user.id}`);
    next();
  });
}

/** Send an event to the admins and to the agent's own manager. */
export function emitToSupervisors(managerId: string | null, event: string, payload: unknown) {
  if (!io) return;
  io.to('admins').emit(event, payload);
  if (managerId) io.to(`manager:${managerId}`).emit(event, payload);
}
