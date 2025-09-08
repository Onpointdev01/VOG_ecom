import 'reflect-metadata';
import dotenv from 'dotenv';
import http from 'http';
import { Server as IOServer } from 'socket.io';

import app from './app';
import connectToDB from './db/connect';
import logger from './utils/logger';
import { decodeToken } from './utils/helpers';

dotenv.config();

const PORT = Number(process.env.PORT) || 6000;

const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export let io: IOServer;

export const emitToUser = (userId: string, event: string, payload: any) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
};

const startServer = async () => {
  await connectToDB();

  const server = http.createServer(app);

  io = new IOServer(server, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    cors: {
      origin: FRONTEND_ORIGIN.length ? FRONTEND_ORIGIN : true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const authToken =
        (socket.handshake.auth as any)?.token ||
        (typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : undefined);

      if (!authToken) {
        return next(); 
      }

      const decoded: any = decodeToken(authToken); 
      if (decoded?.id) {
        socket.data.userId = decoded.id as string;
      }
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data?.userId as string | undefined;

    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.emit('notification', {
      type: 'info',
      title: 'Connected',
      message: 'Realtime channel ready ✅',
      createdAt: new Date().toISOString(),
    });

    socket.on('disconnect', (reason) => {
      if (process.env.NODE_ENV !== 'test') {
        logger.info(`Socket ${socket.id} disconnected: ${reason}`);
      }
    });
  });

  server.listen(PORT, () => {
    if (process.env.NODE_ENV !== 'test') {
      logger.info(`
################################################
🛡️  HTTP + Socket.IO listening on port: ${PORT} 🛡️
################################################
SERVER IN ${process.env.NODE_ENV as string} MODE
      `);
    }
  });
};

startServer();

export default app;
