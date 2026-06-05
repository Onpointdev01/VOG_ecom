import { EventEmitter } from 'events';
import { NotificationDto } from './notificationSerializer';

/** In-process bus for SSE / future realtime (no Socket.IO). */
class NotificationBus extends EventEmitter {
  emitForUser(userId: string, notification: NotificationDto): void {
    this.emit(`user:${userId}`, notification);
  }

  onUser(userId: string, handler: (n: NotificationDto) => void): () => void {
    const channel = `user:${userId}`;
    this.on(channel, handler);
    return () => this.off(channel, handler);
  }
}

export const notificationBus = new NotificationBus();
