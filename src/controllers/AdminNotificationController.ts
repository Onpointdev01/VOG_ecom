import { inject } from 'inversify';
import {
  controller,
  httpDelete,
  httpGet,
  httpPatch,
  request,
  requestParam,
  response,
} from 'inversify-express-utils';
import { Request, Response } from 'express';
import { Model } from 'mongoose';
import TYPES from '../di';
import { BaseController } from './BaseController';
import { IAdmin, INotification, IUser } from '../models';
import { serializeNotifications } from '../utils/notificationSerializer';
import { resolveAdminChatUserId } from '../utils/resolveAdminChatUser';
import AppError from '../utils/errors/AppError';

@controller('/api/v1/admin/notifications')
export class AdminNotificationController extends BaseController {
  constructor(
    @inject(TYPES.Notification) private Notification: Model<INotification>,
    @inject(TYPES.User) private User: Model<IUser>
  ) {
    super();
  }

  private async resolveInboxUserId(req: Request): Promise<string> {
    const admin = (req as Request & { admin?: IAdmin }).admin;
    if (!admin) {
      throw new AppError('Admin not authenticated', 401);
    }
    return resolveAdminChatUserId(admin, this.User);
  }

  @httpGet('/', TYPES.RequireAdmin)
  async getNotifications(@response() res: Response, @request() req: Request) {
    const userId = await this.resolveInboxUserId(req);
    const notifications = await this.Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return this.sendResponse(
      res,
      200,
      'Notifications retrieved successfully',
      serializeNotifications(notifications as INotification[])
    );
  }

  @httpGet('/unread-count', TYPES.RequireAdmin)
  async getUnreadCount(@response() res: Response, @request() req: Request) {
    const userId = await this.resolveInboxUserId(req);
    const count = await this.Notification.countDocuments({
      user: userId,
      isRead: false,
    });
    return this.sendResponse(res, 200, 'Unread count retrieved', { count });
  }

  @httpPatch('/:id/read', TYPES.RequireAdmin)
  async markAsRead(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') notificationId: string
  ) {
    const userId = await this.resolveInboxUserId(req);
    const notification = await this.Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { isRead: true },
      { new: true }
    ).lean();

    if (!notification) {
      return this.sendResponse(res, 404, 'Notification not found', null);
    }

    return this.sendResponse(res, 200, 'Notification marked as read', notification);
  }

  @httpPatch('/read-all', TYPES.RequireAdmin)
  async markAllAsRead(@response() res: Response, @request() req: Request) {
    const userId = await this.resolveInboxUserId(req);
    await this.Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
    return this.sendResponse(res, 200, 'All notifications marked as read', null);
  }

  @httpDelete('/:id', TYPES.RequireAdmin)
  async deleteNotification(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') notificationId: string
  ) {
    const userId = await this.resolveInboxUserId(req);
    const notification = await this.Notification.findOneAndDelete({
      _id: notificationId,
      user: userId,
    });

    if (!notification) {
      return this.sendResponse(res, 404, 'Notification not found', null);
    }

    return this.sendResponse(res, 200, 'Notification deleted', null);
  }
}
