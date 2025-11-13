import { injectable, inject } from 'inversify';
import { Model } from 'mongoose';
import { IUser, INotification } from '../models';
import TYPES from '../di';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

@injectable()
export class NotificationService {
  private expo: Expo;

  constructor(
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Notification) private Notification: Model<INotification>
  ) {
    this.expo = new Expo();
  }

  /**
   * Create an in-app notification
   */
  private async createInAppNotification(
    userId: string,
    type: 'order' | 'bid' | 'product' | 'account' | 'promotional',
    title: string,
    message: string,
    data: any = {},
    link?: string
  ): Promise<void> {
    try {
      await this.Notification.create({
        user: userId,
        type,
        title,
        message,
        body: message, // For compatibility
        data,
        link,
        isRead: false,
      });
      console.log(`Created in-app notification for user ${userId}`);
    } catch (error) {
      console.error('Error creating in-app notification:', error);
    }
  }

  /**
   * Send push notification to a specific user
   * Also creates an in-app notification
   */
  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data: any = {}
  ): Promise<ExpoPushTicket[]> {
    try {
      // Determine notification type from data
      const type = data.type?.includes('order') ? 'order' :
                   data.type?.includes('bid') ? 'bid' :
                   data.type?.includes('product') || data.type?.includes('price') || data.type?.includes('flash') ? 'product' :
                   data.type?.includes('cart') ? 'promotional' :
                   'account';

      // Create in-app notification
      const link = data.orderId ? `/(app)/orders/${data.orderId}` :
                   data.productId ? `/(app)/product/${data.productId}` :
                   undefined;

      await this.createInAppNotification(userId, type, title, body, data, link);

      // Send push notification
      const user = await this.User.findById(userId);
      if (!user || !user.pushTokens || user.pushTokens.length === 0) {
        console.log(`No push tokens found for user: ${userId}`);
        return [];
      }

      const messages: ExpoPushMessage[] = [];

      // Create messages for all user's devices
      for (const pushToken of user.pushTokens) {
        // Check that all push tokens are valid Expo push tokens
        if (!Expo.isExpoPushToken(pushToken)) {
          console.error(`Push token ${pushToken} is not a valid Expo push token`);
          continue;
        }

        messages.push({
          to: pushToken,
          sound: 'default',
          title,
          body,
          data,
          priority: 'high',
          channelId: 'default',
        });
      }

      if (messages.length === 0) {
        console.log('No valid push tokens to send notifications to');
        return [];
      }

      // The Expo push notification service accepts batches of notifications
      const chunks = this.expo.chunkPushNotifications(messages);
      const tickets: ExpoPushTicket[] = [];

      // Send the chunks to the Expo push notification service
      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
          console.log(`Sent ${ticketChunk.length} notifications`);
        } catch (error) {
          console.error('Error sending push notification chunk:', error);
        }
      }

      return tickets;
    } catch (error) {
      console.error('Error in sendPushNotification:', error);
      return [];
    }
  }

  /**
   * Send notification when a bid is accepted
   */
  async sendBidAcceptedNotification(
    userId: string,
    productName: string,
    productId: string,
    bidAmount: number
  ): Promise<ExpoPushTicket[]> {
    return this.sendPushNotification(
      userId,
      'Bid Accepted! 🎉',
      `Your bid of $${bidAmount} on ${productName} was accepted! Add to cart now.`,
      {
        type: 'bid_accepted',
        productId,
        bidAmount,
      }
    );
  }

  /**
   * Send notification when seller sends a message in bid chat
   */
  async sendBidMessageNotification(
    userId: string,
    productName: string,
    productId: string,
    message: string
  ): Promise<ExpoPushTicket[]> {
    return this.sendPushNotification(
      userId,
      'New Message from Seller',
      `${productName}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
      {
        type: 'bid_message',
        productId,
      }
    );
  }

  /**
   * Send notification when a bid is rejected
   */
  async sendBidRejectedNotification(
    userId: string,
    productName: string,
    productId: string
  ): Promise<ExpoPushTicket[]> {
    return this.sendPushNotification(
      userId,
      'Bid Update',
      `Your bid on ${productName} was not accepted.`,
      {
        type: 'bid_rejected',
        productId,
      }
    );
  }

  /**
   * Send notification when seller makes a counter offer
   */
  async sendCounterOfferNotification(
    userId: string,
    productName: string,
    productId: string,
    counterAmount: number
  ): Promise<ExpoPushTicket[]> {
    return this.sendPushNotification(
      userId,
      'Counter Offer Received',
      `Seller offered $${counterAmount} for ${productName}`,
      {
        type: 'counter_offer',
        productId,
        counterAmount,
      }
    );
  }

  /**
   * Send notification for order status updates
   */
  async sendOrderStatusNotification(
    userId: string,
    orderId: string,
    status: string,
    orderNumber?: string
  ): Promise<ExpoPushTicket[]> {
    const statusMessages: Record<string, string> = {
      PENDING: 'Your order has been received',
      CONFIRMED: 'Your order has been confirmed',
      PROCESSING: 'Your order is being prepared',
      SHIPPED: 'Your order has been shipped',
      OUT_FOR_DELIVERY: 'Your order is out for delivery',
      DELIVERED: 'Your order has been delivered',
      COMPLETE: 'Your order is complete',
      CANCELLED: 'Your order has been cancelled',
      // Lowercase variants for backwards compatibility
      pending: 'Your order has been received',
      confirmed: 'Your order has been confirmed',
      processing: 'Your order is being prepared',
      shipped: 'Your order has been shipped',
      delivered: 'Your order has been delivered',
      cancelled: 'Your order has been cancelled',
    };

    const message = statusMessages[status] || `Your order status has been updated`;
    const displayOrderNumber = orderNumber || orderId.substring(0, 8);

    return this.sendPushNotification(
      userId,
      'Order Update',
      `Order #${displayOrderNumber}: ${message}`,
      {
        type: 'order_status',
        orderId,
        status,
      }
    );
  }

  /**
   * Send flash sale notification
   */
  async sendFlashSaleNotification(
    userId: string,
    productName: string,
    productId: string,
    discount: number
  ): Promise<ExpoPushTicket[]> {
    return this.sendPushNotification(
      userId,
      '⚡ Flash Sale Alert!',
      `${productName} is now ${discount}% off! Limited time only.`,
      {
        type: 'flash_sale',
        productId,
        discount,
      }
    );
  }

  /**
   * Send wishlist item price drop notification
   */
  async sendPriceDropNotification(
    userId: string,
    productName: string,
    productId: string,
    oldPrice: number,
    newPrice: number
  ): Promise<ExpoPushTicket[]> {
    const discount = Math.round(((oldPrice - newPrice) / oldPrice) * 100);

    return this.sendPushNotification(
      userId,
      'Price Drop! 💰',
      `${productName} dropped from $${oldPrice} to $${newPrice} (${discount}% off)`,
      {
        type: 'price_drop',
        productId,
        oldPrice,
        newPrice,
      }
    );
  }

  /**
   * Send cart abandonment reminder
   */
  async sendCartReminderNotification(
    userId: string,
    itemCount: number
  ): Promise<ExpoPushTicket[]> {
    return this.sendPushNotification(
      userId,
      'Items waiting in your cart',
      `You have ${itemCount} item${itemCount > 1 ? 's' : ''} in your cart. Complete your purchase now!`,
      {
        type: 'cart_reminder',
      }
    );
  }

  /**
   * Save push token for a user
   */
  async savePushToken(userId: string, token: string): Promise<void> {
    try {
      if (!Expo.isExpoPushToken(token)) {
        throw new Error('Invalid Expo push token format');
      }

      await this.User.findByIdAndUpdate(
        userId,
        { $addToSet: { pushTokens: token } }, // $addToSet prevents duplicates
        { new: true }
      );

      console.log(`Saved push token for user ${userId}`);
    } catch (error) {
      console.error('Error saving push token:', error);
      throw error;
    }
  }

  /**
   * Remove push token for a user (e.g., on logout or app uninstall)
   */
  async removePushToken(userId: string, token: string): Promise<void> {
    try {
      await this.User.findByIdAndUpdate(
        userId,
        { $pull: { pushTokens: token } }, // $pull removes the token
        { new: true }
      );

      console.log(`Removed push token for user ${userId}`);
    } catch (error) {
      console.error('Error removing push token:', error);
      throw error;
    }
  }

  /**
   * Remove all push tokens for a user (e.g., on account deletion)
   */
  async removeAllPushTokens(userId: string): Promise<void> {
    try {
      await this.User.findByIdAndUpdate(
        userId,
        { $set: { pushTokens: [] } },
        { new: true }
      );

      console.log(`Removed all push tokens for user ${userId}`);
    } catch (error) {
      console.error('Error removing all push tokens:', error);
      throw error;
    }
  }

  /**
   * Send notification to multiple users
   */
  async sendBulkNotifications(
    userIds: string[],
    title: string,
    body: string,
    data: any = {}
  ): Promise<void> {
    const notifications = userIds.map(userId =>
      this.sendPushNotification(userId, title, body, data)
    );

    await Promise.all(notifications);
  }
}
