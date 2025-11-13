import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPatch,
  httpPut,
  httpDelete,
  requestParam,
  response,
  request,
  queryParam,
} from 'inversify-express-utils';
import { Response, Request } from 'express';
import { Model } from 'mongoose';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IBidMessageService } from '../services';
import { IUser, INotification } from '../models';

@controller('/api/v1/notifications')
export class NotificationController extends BaseController {
  constructor(
    @inject(TYPES.BidMessageService) private bidMessageService: IBidMessageService,
    @inject(TYPES.Notification) private Notification: Model<INotification>
  ) {
    super();
  }

  /**
   * Get all notifications for the authenticated user
   */
  @httpGet('/', TYPES.RequireSignIn)
  async getNotifications(
    @response() res: Response,
    @request() req: Request
  ) {
    try {
      const user = req.user as IUser;

      const notifications = await this.Notification.find({ user: user._id })
        .sort({ createdAt: -1 })
        .limit(100) // Limit to last 100 notifications
        .lean();

      return this.sendResponse(res, 200, 'Notifications retrieved successfully', notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return this.sendResponse(res, 500, 'Failed to fetch notifications', null);
    }
  }

  /**
   * Mark a single notification as read
   */
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
      );

      if (!notification) {
        return this.sendResponse(res, 404, 'Notification not found', null);
      }

      return this.sendResponse(res, 200, 'Notification marked as read', notification);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return this.sendResponse(res, 500, 'Failed to mark notification as read', null);
    }
  }

  /**
   * Mark all notifications as read for the user
   */
  @httpPatch('/read-all', TYPES.RequireSignIn)
  async markAllAsRead(
    @response() res: Response,
    @request() req: Request
  ) {
    try {
      const user = req.user as IUser;

      await this.Notification.updateMany(
        { user: user._id, isRead: false },
        { isRead: true }
      );

      return this.sendResponse(res, 200, 'All notifications marked as read', null);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return this.sendResponse(res, 500, 'Failed to mark all notifications as read', null);
    }
  }

  /**
   * Delete a single notification
   */
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

  /**
   * Clear all notifications for the user
   */
  @httpDelete('/', TYPES.RequireSignIn)
  async clearAllNotifications(
    @response() res: Response,
    @request() req: Request
  ) {
    try {
      const user = req.user as IUser;

      await this.Notification.deleteMany({ user: user._id });

      return this.sendResponse(res, 200, 'All notifications cleared', null);
    } catch (error) {
      console.error('Error clearing notifications:', error);
      return this.sendResponse(res, 500, 'Failed to clear notifications', null);
    }
  }

  @httpGet('/bid-messages', TYPES.RequireSignIn)
  async getBidMessages(
    @response() res: Response,
    @request() req: Request,
    @queryParam('productId') productId?: string
  ) {
    const user = req.user as IUser;
    
    const messages = await this.bidMessageService.getBidMessages(
      (user._id as string).toString(),
      productId
    );

    return this.sendResponse(res, 200, 'Bid messages retrieved successfully', messages);
  }

  @httpPut('/bid-messages/:messageId/read', TYPES.RequireSignIn)
  async markMessageAsRead(
    @response() res: Response,
    @request() req: Request,
    @requestParam('messageId') messageId: string
  ) {
    const user = req.user as IUser;
    
    const message = await this.bidMessageService.markMessageAsRead(
      messageId,
      (user._id as string).toString()
    );

    return this.sendResponse(res, 200, 'Message marked as read', message);
  }
}