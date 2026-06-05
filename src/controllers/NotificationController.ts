import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPatch,
  httpDelete,
  requestParam,
  response,
  request,
} from 'inversify-express-utils';
import { Response, Request } from 'express';
import { Model } from 'mongoose';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IUser, INotification } from '../models';
import { serializeNotifications } from '../utils/notificationSerializer';
import { notificationBus } from '../utils/notificationBus';
import { NotificationService } from '../services/NotificationService';

@controller('/api/v1/notifications')
export class NotificationController extends BaseController {
  constructor(
    @inject(TYPES.Notification) private Notification: Model<INotification>,
    @inject(TYPES.NotificationService) private notificationService: NotificationService
  ) {
    super();
  }

  @httpGet('/', TYPES.RequireSignIn)
  async getNotifications(@response() res: Response, @request() req: Request) {
    try {
      const user = req.user as IUser;
      const targetParam = (req.query as Record<string, string>).target;
      const targetFilter = targetParam === 'seller'
        ? { $in: ['seller', 'both'] }
        : { $in: ['buyer', 'both'] };

      const notifications = await this.Notification.find({ user: user._id, target: targetFilter })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      return this.sendResponse(
        res,
        200,
        'Notifications retrieved successfully',
        serializeNotifications(notifications as INotification[])
      );
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return this.sendResponse(res, 500, 'Failed to fetch notifications', null);
    }
  }

  @httpGet('/unread-count', TYPES.RequireSignIn)
  async getUnreadCount(@response() res: Response, @request() req: Request) {
    try {
      const user = req.user as IUser;
      const userId = (user._id as { toString(): string }).toString();
      const targetParam = (req.query as Record<string, string>).target;
      const count = await this.notificationService.getUnreadCount(userId, targetParam as 'buyer' | 'seller' | undefined);
      return this.sendResponse(res, 200, 'Unread count retrieved', { count });
    } catch (error) {
      console.error('Error fetching unread count:', error);
      return this.sendResponse(res, 500, 'Failed to fetch unread count', null);
    }
  }

  @httpGet('/unread-summary', TYPES.RequireSignIn)
  async getUnreadSummary(@response() res: Response, @request() req: Request) {
    try {
      const user = req.user as IUser;
      const userId = (user._id as { toString(): string }).toString();
      const targetParam = (req.query as Record<string, string>).target;
      const summary = await this.notificationService.getSellerUnreadSummary(userId, targetParam as 'buyer' | 'seller' | undefined);
      return this.sendResponse(res, 200, 'Unread summary retrieved', summary);
    } catch (error) {
      console.error('Error fetching unread summary:', error);
      return this.sendResponse(res, 500, 'Failed to fetch unread summary', null);
    }
  }

  /**
   * Lightweight SSE stream — no Socket.IO. Client reconnects on disconnect.
   */
  @httpGet('/stream', TYPES.RequireSignIn)
  async streamNotifications(@response() res: Response, @request() req: Request) {
    const user = req.user as IUser;
    const userId = (user._id as { toString(): string }).toString();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: string, payload: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    send('connected', { userId });

    const unsubscribe = notificationBus.onUser(userId, (notification) => {
      send('notification', notification);
    });

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  }

  @httpPatch('/:id/read', TYPES.RequireSignIn)
  async markAsRead(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') notificationId: string
  ) {
    try {
      const user = req.user as IUser;
      const notification = await this.Notification.findOneAndUpdate(
        { _id: notificationId, user: user._id },
        { isRead: true },
        { new: true }
      ).lean();

      if (!notification) {
        return this.sendResponse(res, 404, 'Notification not found', null);
      }

      return this.sendResponse(res, 200, 'Notification marked as read', notification);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return this.sendResponse(res, 500, 'Failed to mark notification as read', null);
    }
  }

  @httpPatch('/read-all', TYPES.RequireSignIn)
  async markAllAsRead(@response() res: Response, @request() req: Request) {
    try {
      const user = req.user as IUser;
      const targetParam = (req.query as Record<string, string>).target;
      const targetFilter = targetParam === 'seller'
        ? { $in: ['seller', 'both'] }
        : targetParam === 'buyer'
          ? { $in: ['buyer', 'both'] }
          : undefined;
      const query: Record<string, unknown> = { user: user._id, isRead: false };
      if (targetFilter) query.target = targetFilter;
      await this.Notification.updateMany(query, { isRead: true });
      return this.sendResponse(res, 200, 'All notifications marked as read', null);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return this.sendResponse(res, 500, 'Failed to mark all notifications as read', null);
    }
  }

  @httpDelete('/:id', TYPES.RequireSignIn)
  async deleteNotification(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') notificationId: string
  ) {
    try {
      const user = req.user as IUser;
      const notification = await this.Notification.findOneAndDelete({
        _id: notificationId,
        user: user._id,
      });

      if (!notification) {
        return this.sendResponse(res, 404, 'Notification not found', null);
      }

      return this.sendResponse(res, 200, 'Notification deleted', null);
    } catch (error) {
      console.error('Error deleting notification:', error);
      return this.sendResponse(res, 500, 'Failed to delete notification', null);
    }
  }

  @httpDelete('/', TYPES.RequireSignIn)
  async clearAllNotifications(@response() res: Response, @request() req: Request) {
    try {
      const user = req.user as IUser;
      const targetParam = (req.query as Record<string, string>).target;
      const targetFilter = targetParam === 'seller'
        ? { $in: ['seller', 'both'] }
        : targetParam === 'buyer'
          ? { $in: ['buyer', 'both'] }
          : undefined;
      const query: Record<string, unknown> = { user: user._id };
      if (targetFilter) query.target = targetFilter;
      await this.Notification.deleteMany(query);
      return this.sendResponse(res, 200, 'All notifications cleared', null);
    } catch (error) {
      console.error('Error clearing notifications:', error);
      return this.sendResponse(res, 500, 'Failed to clear notifications', null);
    }
  }
}
