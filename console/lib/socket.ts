'use client';
import { io, type Socket } from 'socket.io-client';
import { API_URL, session } from './api';

let socket: Socket | null = null;

export function liveSocket(): Socket | null {
  if (socket) return socket;
  if (!session.get()) return null;
  socket = io(API_URL, { auth: (cb) => cb({ token: session.get()?.accessToken }), transports: ['websocket', 'polling'], reconnectionDelayMax: 30000 });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
