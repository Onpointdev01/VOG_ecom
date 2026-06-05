import { injectable } from 'inversify';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { IUser } from '../models';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: IUser;
  isAdmin?: boolean;
  handshake: Socket['handshake'];
}

@injectable()
export class WebSocketService {
  private io: SocketIOServer | null = null;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private adminSockets: Set<string> = new Set(); // Set of admin socketIds

  /**
   * Initialize Socket.IO server with Redis adapter for scaling
   */
  async initialize(server: HttpServer): Promise<void> {
    // Simple CORS - allow all origins (no cookies/credentials used)
    this.io = new SocketIOServer(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    // Add Redis adapter if Redis URL is configured (for multi-instance scaling)
    if (process.env.REDIS_URL) {
      try {
        const pubClient = createClient({ url: process.env.REDIS_URL });
        const subClient = pubClient.duplicate();

        await Promise.all([pubClient.connect(), subClient.connect()]);

        this.io.adapter(createAdapter(pubClient, subClient));
        console.log('✅ Redis adapter connected for Socket.IO scaling');
      } catch (error) {
        console.error('⚠️ Failed to connect Redis adapter, continuing without it:', error);
        // Continue without Redis adapter (single instance mode)
      }
    }

    // Authentication middleware
    this.io.use((socket: AuthenticatedSocket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        // Allow connection without auth, but mark as unauthenticated
        return next();
      }

      try {
        // Verify JWT token using the same secret as the middleware
        const jwt = require('jsonwebtoken');
        const { env } = require('../config/env');
        const decoded = jwt.verify(token, env.JWT_SECRET) as any;
        
        // Extract user ID (can be from different fields depending on token type)
        socket.userId = decoded.id || decoded.userId || decoded._id;
        socket.user = decoded;
        
        // Check if user is admin (for admin notifications)
        // Admin tokens have userType: 'admin' or role field
        socket.isAdmin = decoded.userType === 'admin' || 
                        decoded.role === 'ADMIN' || 
                        decoded.role === 'SUPER_ADMIN' || 
                        decoded.isAdmin === true;
        
        if (socket.userId) {
          console.log(`✅ WebSocket authenticated: userId=${socket.userId}, isAdmin=${socket.isAdmin}`);
        }
      } catch (error: any) {
        // Only log non-expiration errors as errors
        // Token expiration is normal and expected behavior
        if (error.name === 'TokenExpiredError' || error.message?.includes('expired')) {
          // Silently allow connection without auth if token is expired
          // Client should refresh token and reconnect
          socket.userId = undefined;
          socket.isAdmin = false;
        } else {
          // Log other authentication errors (invalid token, malformed, etc.)
          console.error('❌ WebSocket auth error:', error.message);
          socket.userId = undefined;
          socket.isAdmin = false;
        }
      }

      next();
    });

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`🔌 WebSocket client connected: ${socket.id}`);

      if (socket.userId) {
        // Add socket to user's socket set
        if (!this.userSockets.has(socket.userId)) {
          this.userSockets.set(socket.userId, new Set());
        }
        this.userSockets.get(socket.userId)!.add(socket.id);
        console.log(`✅ User ${socket.userId} connected via socket ${socket.id}`);
      }

      // Track admin sockets
      if (socket.isAdmin) {
        this.adminSockets.add(socket.id);
        console.log(`👨‍💼 Admin connected via socket ${socket.id}`);
      }

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 WebSocket client disconnected: ${socket.id}`);
        
        if (socket.userId) {
          const userSockets = this.userSockets.get(socket.userId);
          if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
              this.userSockets.delete(socket.userId);
            }
          }
        }

        // Remove from admin sockets
        if (socket.isAdmin) {
          this.adminSockets.delete(socket.id);
        }
      });

      // Handle ping/pong for keepalive (client pings, server responds)
      socket.on('ping', () => {
        socket.emit('pong');
      });
    });

    console.log('✅ WebSocket service initialized');
  }

  /**
   * Emit notification to a specific user
   */
  emitNotificationToUser(userId: string, notification: any): void {
    if (!this.io) {
      console.warn('⚠️ WebSocket server not initialized');
      return;
    }

    const userSockets = this.userSockets.get(userId);
    if (!userSockets || userSockets.size === 0) {
      console.log(`📭 No active sockets for user ${userId}`);
      return;
    }

    // Emit to all sockets for this user
    userSockets.forEach((socketId) => {
      this.io!.to(socketId).emit('notification', notification);
    });

    console.log(`📬 Notification sent to user ${userId} via ${userSockets.size} socket(s)`);
  }

  /**
   * Emit notification to all connected users (admin notifications)
   */
  emitToAll(event: string, data: any): void {
    if (!this.io) {
      console.warn('⚠️ WebSocket server not initialized');
      return;
    }

    this.io.emit(event, data);
    console.log(`📢 Broadcasted ${event} to all connected clients`);
  }

  /**
   * Emit notification to admins only
   */
  emitToAdmins(event: string, data: any): void {
    if (!this.io) {
      console.warn('⚠️ WebSocket server not initialized');
      return;
    }

    // Emit to all admin sockets
    if (this.adminSockets.size === 0) {
      console.log('📭 No admin sockets connected');
      return;
    }

    this.adminSockets.forEach((socketId) => {
      this.io!.to(socketId).emit(event, data);
    });

    console.log(`📢 Broadcasted ${event} to ${this.adminSockets.size} admin(s)`);
  }

  /**
   * Get number of connected users
   */
  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  /**
   * Check if a user is connected
   */
  isUserConnected(userId: string): boolean {
    const userSockets = this.userSockets.get(userId);
    return userSockets ? userSockets.size > 0 : false;
  }
}

