import { injectable, inject } from 'inversify';
import { Model } from 'mongoose';
import { IUser, INotification, IProduct, ISeller, IAdmin } from '../models';
import TYPES from '../di';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { WebSocketService } from './WebSocketService';
import { sendEmail, renderTemplate } from '../utils/helpers/sendMail';
import { AdminService } from './AdminService';

@injectable()
export class NotificationService {
  private expo: Expo;
  private webSocketService?: WebSocketService;
  private adminService?: AdminService;

  constructor(
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Notification) private Notification: Model<INotification>,
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.Seller) private Seller: Model<ISeller>,
    @inject(TYPES.Admin) private Admin: Model<IAdmin>
  ) {
    this.expo = new Expo();
  }

  /**
   * Set WebSocket service (called after WebSocketService is initialized)
   */
  setWebSocketService(webSocketService: WebSocketService): void {
    this.webSocketService = webSocketService;
  }

  /**
   * Set AdminService (called after AdminService is initialized)
   */
  setAdminService(adminService: AdminService): void {
    this.adminService = adminService;
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    userId: string,
    title: string,
    message: string,
    link?: string
  ): Promise<void> {
    try {
      const user = await this.User.findById(userId);
      if (!user || !user.email) {
        console.log(`No email found for user: ${userId}`);
        return;
      }

      // Build full URL if link is provided
      const frontendUrl = process.env.FRONTEND_URL || 'https://market.st-cael.org';
      const fullLink = link ? `${frontendUrl}${link}` : undefined;

      // Build link button HTML
      const linkButton = fullLink
        ? `<div class="button-container">
            <a href="${fullLink}" class="button">View Details</a>
          </div>`
        : '';

      // Render email template
      const html = renderTemplate('src/utils/templates/notification-email.html', {
        title,
        message,
        linkButton,
        frontendUrl,
      });

      // Send email (use Gmail if configured, otherwise Resend)
      const useGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
      await sendEmail({
        to: [user.email],
        subject: title,
        html,
        useGmail,
      });

      console.log(`📧 Email notification sent to ${user.email}: ${title}`);
    } catch (error) {
      console.error('Error sending email notification:', error);
      // Don't throw - email failures shouldn't break notification flow
    }
  }

  /**
   * Create an in-app notification with channel tracking
   */
  private async createInAppNotification(
    userId: string,
    type: 'order' | 'bid' | 'product' | 'account' | 'promotional' | 'payment',
    title: string,
    message: string,
    data: any = {},
    link?: string,
    channel: 'websocket' | 'push' | 'email' | 'in-app' = 'in-app',
    payload?: any,
    sendEmail: boolean = true // New parameter to control email sending
  ): Promise<void> {
    try {
      // Check if user exists before creating notification
      const user = await this.User.findById(userId);
      if (!user) {
        console.log(`User ${userId} not found, skipping in-app notification creation`);
        return;
      }

      const notification = await this.Notification.create({
        user: userId,
        type,
        title,
        message,
        body: message, // For compatibility
        data,
        payload: payload || data, // Use payload for structured data
        link,
        channel,
        isRead: false,
      });
      console.log(`Created ${channel} notification for user ${userId}`);

      // Send email notification if enabled (for important notifications like orders, bids, and payments)
      if (sendEmail && (type === 'order' || type === 'bid' || type === 'payment')) {
        try {
        await this.sendEmailNotification(userId, title, message, link);
          console.log(`📧 Email notification sent successfully to user ${userId} for ${type} notification`);
        } catch (error: any) {
          console.error(`❌ Failed to send email notification to user ${userId}:`, error?.message || error);
          // Don't throw - email failure shouldn't break notification creation
        }
      }

      // Emit WebSocket notification (if WebSocketService is available and channel is websocket/in-app)
      if (this.webSocketService && (channel === 'websocket' || channel === 'in-app')) {
        try {
        this.webSocketService.emitNotificationToUser(userId, {
          _id: notification._id,
          type,
          title,
          message,
          body: message,
          data,
          payload: payload || data,
          link,
          channel,
          isRead: false,
          createdAt: notification.createdAt,
          updatedAt: notification.updatedAt,
        });
          console.log(`📬 WebSocket notification emitted successfully to user ${userId}`);
        } catch (error: any) {
          console.error(`❌ Failed to emit WebSocket notification to user ${userId}:`, error?.message || error);
          // Don't throw - WebSocket failure shouldn't break notification creation
        }
      }
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
      // Check if user exists first to prevent errors
      const user = await this.User.findById(userId);
      if (!user) {
        console.log(`User ${userId} not found, skipping push notification`);
        return [];
      }

      // Determine notification type from data
      const type = data.type?.includes('order') ? 'order' :
                   data.type?.includes('bid') ? 'bid' :
                   data.type?.includes('product') || data.type?.includes('price') || data.type?.includes('flash') ? 'product' :
                   data.type?.includes('cart') ? 'promotional' :
                   'account';

      // Create in-app notification
      // Generate web-friendly links (for website) and mobile-friendly links (for app)
      let link: string | undefined;
      if (data.orderId) {
        link = `/Profile?tab=orders`; // Web link
      } else if (data.productId) {
        if (data.bidId) {
          // For bid accepted notifications, link to add-to-cart page
          if (data.type === 'bid_accepted' && data.addToCartLink) {
            link = data.addToCartLink; // Use the addToCartLink from data
          } else {
            // For other bid notifications, link to profile bids tab
            link = `/Profile?tab=bids`; // Web link - will open bid modal
          }
        } else {
          link = `/product/${data.productId}`; // Web link
        }
      }

      await this.createInAppNotification(userId, type, title, body, data, link);

      // Send push notification
      if (!user.pushTokens || user.pushTokens.length === 0) {
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
    bidAmount: number,
    bidId?: string
  ): Promise<ExpoPushTicket[]> {
    // Generate add-to-cart link for email
    const frontendUrl = process.env.FRONTEND_URL || 'https://market.st-cael.org';
    const addToCartLink = bidId 
      ? `${frontendUrl}/bid/${bidId}/add-to-cart`
      : `${frontendUrl}/product/${productId}`;
    
    // Send email notification with link
    if (userId) {
      try {
        const user = await this.User.findById(userId);
        if (user && user.email) {
          const useGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
          
          await sendEmail({
            to: [user.email],
            subject: `Your bid of $${bidAmount} on ${productName} was accepted! 🎉`,
            html: renderTemplate('src/utils/templates/bid-accepted-email.html', {
              firstName: user.firstName || 'there',
              productName,
              bidAmount: `$${bidAmount}`,
              productPrice: `$${bidAmount}`, // Use bid price as the new price
              addToCartLink,
              frontendUrl,
              year: new Date().getFullYear().toString(),
            }),
            useGmail,
          });
          console.log(`📧 Bid acceptance email sent to ${user.email}`);
        }
      } catch (error) {
        console.error('Failed to send bid acceptance email:', error);
        // Don't throw - email failure shouldn't break notification
      }
    }
    
    return this.sendPushNotification(
      userId,
      'Bid Accepted! 🎉',
      `Your bid of $${bidAmount} on ${productName} was accepted! Add to cart now.`,
      {
        type: 'bid_accepted',
        productId,
        bidId,
        bidAmount,
        addToCartLink: bidId ? `/bid/${bidId}/add-to-cart` : undefined,
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
    productId: string,
    bidId?: string,
    reason?: string
  ): Promise<ExpoPushTicket[]> {
    const message = reason && reason.trim()
      ? `Your bid on ${productName} was not accepted. Reason: ${reason}`
      : `Your bid on ${productName} was not accepted.`;
    
    return this.sendPushNotification(
      userId,
      'Bid Update',
      message,
      {
        type: 'bid_rejected',
        productId,
        bidId,
        reason: reason || undefined,
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

    const statusDetails: Record<string, { icon: string; title: string; description: string; class: string }> = {
      PENDING: {
        icon: '📦',
        title: 'Order Received',
        description: 'We have received your order and are processing it. You will receive a confirmation email shortly.',
        class: '',
      },
      CONFIRMED: {
        icon: '✅',
        title: 'Order Confirmed',
        description: 'Your order has been confirmed and is being prepared for shipment.',
        class: '',
      },
      PROCESSING: {
        icon: '⚙️',
        title: 'Order Processing',
        description: 'Your order is being prepared and will be shipped soon.',
        class: '',
      },
      SHIPPED: {
        icon: '🚚',
        title: 'Order Shipped',
        description: 'Great news! Your order has been shipped and is on its way to you.',
        class: '',
      },
      OUT_FOR_DELIVERY: {
        icon: '📬',
        title: 'Out for Delivery',
        description: 'Your order is out for delivery and should arrive soon. Please ensure someone is available to receive it.',
        class: '',
      },
      DELIVERED: {
        icon: '🎉',
        title: 'Order Delivered',
        description: 'Your order has been successfully delivered. We hope you enjoy your purchase!',
        class: '',
      },
      COMPLETE: {
        icon: '✨',
        title: 'Order Complete',
        description: 'Your order has been completed. Thank you for shopping with us!',
        class: '',
      },
      CANCELLED: {
        icon: '❌',
        title: 'Order Cancelled',
        description: 'Your order has been cancelled. If you have any questions, please contact our support team.',
        class: 'status-cancelled',
      },
      // Lowercase variants
      pending: {
        icon: '📦',
        title: 'Order Received',
        description: 'We have received your order and are processing it. You will receive a confirmation email shortly.',
        class: '',
      },
      confirmed: {
        icon: '✅',
        title: 'Order Confirmed',
        description: 'Your order has been confirmed and is being prepared for shipment.',
        class: '',
      },
      processing: {
        icon: '⚙️',
        title: 'Order Processing',
        description: 'Your order is being prepared and will be shipped soon.',
        class: '',
      },
      shipped: {
        icon: '🚚',
        title: 'Order Shipped',
        description: 'Great news! Your order has been shipped and is on its way to you.',
        class: '',
      },
      delivered: {
        icon: '🎉',
        title: 'Order Delivered',
        description: 'Your order has been successfully delivered. We hope you enjoy your purchase!',
        class: '',
      },
      cancelled: {
        icon: '❌',
        title: 'Order Cancelled',
        description: 'Your order has been cancelled. If you have any questions, please contact our support team.',
        class: 'status-cancelled',
      },
    };

    const message = statusMessages[status] || `Your order status has been updated`;
    const displayOrderNumber = orderNumber || orderId.substring(0, 8);
    const statusDetail = statusDetails[status] || {
      icon: '📦',
      title: 'Order Update',
      description: message,
      class: '',
    };

    // Generate order link for email
    const frontendUrl = process.env.FRONTEND_URL || 'https://market.st-cael.org';
    const orderLink = `${frontendUrl}/Profile?tab=orders`;
    
    // Send email notification with order details
    if (userId) {
      try {
        console.log(`📧 Attempting to send order status email for user ${userId}, order #${displayOrderNumber}, status: ${status}`);
        const user = await this.User.findById(userId);
        
        if (!user) {
          console.error(`❌ User not found: ${userId}`);
          // Don't call sendPushNotification if user doesn't exist - it will fail
          // Just return empty array to prevent unhandled promise rejection
          return [];
        }
        
        if (!user.email) {
          console.error(`❌ User ${userId} does not have an email address`);
          // Try to send push notification, but catch any errors
          try {
            return await this.sendPushNotification(
      userId,
      'Order Update',
      `Order #${displayOrderNumber}: ${message}`,
      {
        type: 'order_status',
        orderId,
        status,
      }
    );
          } catch (pushError) {
            console.error('Failed to send push notification:', pushError);
            return [];
          }
        }
        
        console.log(`📧 User found with email: ${user.email}`);
        const useGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
        const resendConfigured = !!process.env.RESEND_PASSKEY;
        console.log(`📧 Email service config - Gmail: ${!!useGmail}, Resend: ${resendConfigured}`);
        
        const templatePath = 'src/utils/templates/order-status-email.html';
        console.log(`📧 Loading email template from: ${templatePath}`);
        
        const html = renderTemplate(templatePath, {
          firstName: user.firstName || 'there',
          orderNumber: displayOrderNumber,
          status: status.toUpperCase(),
          statusIcon: statusDetail.icon,
          statusTitle: statusDetail.title,
          statusMessage: message,
          statusDescription: statusDetail.description,
          statusClass: statusDetail.class,
          orderLink,
          frontendUrl,
          year: new Date().getFullYear().toString(),
        });
        
        console.log(`📧 Template rendered successfully, sending email...`);
        
        await sendEmail({
          to: [user.email],
          subject: `Order #${displayOrderNumber} - ${statusDetail.title}`,
          html,
          useGmail,
        });
        
        console.log(`✅ Order status email sent successfully to ${user.email} for order #${displayOrderNumber}`);
      } catch (error: any) {
        console.error('❌ Failed to send order status email:', error);
        console.error('Error details:', {
          message: error?.message,
          stack: error?.stack,
          userId,
          orderId,
          orderNumber: displayOrderNumber,
          status,
        });
        // Don't throw - email failure shouldn't break notification
      }
    } else {
      console.error(`❌ No userId provided for order status notification`);
      return [];
    }

    // Send push notification, but catch any errors to prevent unhandled promise rejection
    try {
      return await this.sendPushNotification(
        userId,
        'Order Update',
        `Order #${displayOrderNumber}: ${message}`,
        {
          type: 'order_status',
          orderId,
          status,
        }
      );
    } catch (error: any) {
      // If user doesn't exist or any other error occurs, log and return empty array
      console.error('Failed to send push notification for order status:', error?.message || error);
      return [];
    }
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

  /**
   * Send notification to all admins (for admin dashboard)
   * Creates persistent notifications for each admin and sends via WebSocket and email
   */
  async sendAdminNotification(
    title: string,
    message: string,
    data: any = {},
    link?: string,
    shouldSendEmail: boolean = true
  ): Promise<void> {
    try {
      // Determine notification type from data
      const type = data.type?.includes('order') ? 'order' :
                   data.type?.includes('bid') ? 'bid' :
                   data.type?.includes('payment') ? 'payment' :
                   data.type?.includes('user') ? 'user' :
                   data.type?.includes('product') ? 'product' :
                   'account';

      // Get all active admins
      const admins = await this.Admin.find({ isActive: true }).select('_id email firstName lastName');
      
      if (admins.length === 0) {
        console.log('No active admins found for notification');
        return;
      }

      // Create notification for each admin
      const notificationPromises = admins.map(async (admin) => {
        try {
          const adminId = (admin._id as any).toString();
          
          // Store notification in database for admin
          const notification = await this.Notification.create({
            adminId: adminId,
            type: type === 'order' || type === 'bid' || type === 'product' ? type : 'admin_message',
        title,
        message,
        body: message,
        data,
            payload: data,
        link,
            channel: 'in-app',
        isRead: false,
          });
          
          console.log(`✅ Created admin notification in database for admin ${adminId}: ${title}`);

          const adminNotification = {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            body: notification.body,
            data: notification.data,
            payload: notification.payload,
            link: notification.link,
            isRead: notification.isRead,
            createdAt: notification.createdAt,
            updatedAt: notification.updatedAt,
            adminId,
          };

          // Send email to admin if enabled
          if (shouldSendEmail && admin.email) {
            try {
              const frontendUrl = process.env.ADMIN_FRONTEND_URL || process.env.FRONTEND_URL || 'https://st-cael.org';
              const fullLink = link ? `${frontendUrl}${link}` : undefined;
              const linkButton = fullLink
                ? `<div class="button-container">
                    <a href="${fullLink}" class="button">View Details</a>
                  </div>`
                : '';

              const html = renderTemplate('src/utils/templates/notification-email.html', {
                title,
                message,
                linkButton,
                frontendUrl,
              });

              const useGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
              await sendEmail({
                to: [admin.email],
                subject: `[Admin] ${title}`,
                html,
                useGmail,
              });
              console.log(`📧 Admin notification email sent successfully to ${admin.email}: ${title}`);
            } catch (error: any) {
              console.error(`❌ Failed to send email to admin ${admin.email}:`, error?.message || error);
              console.error('Email error details:', {
                email: admin.email,
                error: error?.message,
                stack: error?.stack,
              });
            }
          }

          // Emit via WebSocket to this admin
      if (this.webSocketService) {
            // Emit both 'notification' and 'admin_notification' for compatibility
            this.webSocketService.emitToAdmins('notification', adminNotification);
        this.webSocketService.emitToAdmins('admin_notification', adminNotification);
            console.log(`📬 Admin notification emitted via WebSocket for admin ${adminId}`);
          }

          return adminNotification;
        } catch (error: any) {
          console.error(`❌ Error creating notification for admin ${admin._id}:`, error?.message || error);
          console.error('Error details:', {
            adminId: admin._id,
            error: error?.message,
            stack: error?.stack,
          });
          return null;
        }
      });

      const notifications = await Promise.all(notificationPromises);

      console.log(`📢 Admin notification sent to ${admins.length} admin(s): ${title}`);
    } catch (error) {
      console.error('Error sending admin notification:', error);
    }
  }

  /**
   * Send notification to client when a new order is created
   */
  async sendNewOrderNotificationToClient(
    userId: string,
    orderId: string,
    orderNumber: string,
    totalAmount: number
  ): Promise<void> {
    try {
      await this.createInAppNotification(
        userId,
        'order',
        'Order Confirmed',
        `Your order #${orderNumber} has been placed successfully. Total: $${totalAmount.toFixed(2)}`,
        {
          type: 'order_created',
          orderId,
          orderNumber,
          totalAmount,
        },
        `/Profile?tab=orders`,
        'in-app',
        {
          orderId,
          orderNumber,
          totalAmount,
        },
        true // Send email
      );
    } catch (error) {
      console.error('Error sending new order notification to client:', error);
    }
  }

  /**
   * Send notification when a new order is created (to admins)
   */
  async sendNewOrderNotificationToAdmins(
    orderId: string,
    orderNumber: string,
    customerName: string,
    totalAmount: number,
    paymentMethod: string
  ): Promise<void> {
    return this.sendAdminNotification(
      'New Order Received',
      `Order #${orderNumber} from ${customerName} - $${totalAmount.toFixed(2)} (${paymentMethod})`,
      {
        type: 'order_created',
        orderId,
        orderNumber,
        totalAmount,
        paymentMethod,
      },
      `/orders?orderId=${orderId}`,
      true // Send email
    );
  }

  /**
   * Send notification when order status changes (to admins)
   * @param excludeAdminId - Admin ID to exclude from notifications (the admin who performed the action)
   */
  async sendOrderStatusChangeNotificationToAdmins(
    orderId: string,
    orderNumber: string,
    oldStatus: string,
    newStatus: string,
    customerName?: string,
    excludeAdminId?: string
  ): Promise<void> {
    try {
      // Determine notification type from data
      const type = 'order';

      // Get all active admins, excluding the one who performed the action
      const adminQuery: any = { isActive: true };
      if (excludeAdminId) {
        adminQuery._id = { $ne: excludeAdminId };
      }
      
      const admins = await this.Admin.find(adminQuery).select('_id email firstName lastName');
      
      if (admins.length === 0) {
        console.log('No active admins found for notification (excluding performer)');
        return;
      }

      // Create notification for each admin (excluding the one who performed the action)
      const notificationPromises = admins.map(async (admin) => {
        try {
          const adminId = (admin._id as any).toString();
          
          // Store notification in database for admin
          const notification = await this.Notification.create({
            adminId: adminId,
            type: 'admin_message',
            title: 'Order Status Updated',
            message: `Order #${orderNumber} status changed from ${oldStatus} to ${newStatus}${customerName ? ` (Customer: ${customerName})` : ''}`,
            body: `Order #${orderNumber} status changed from ${oldStatus} to ${newStatus}${customerName ? ` (Customer: ${customerName})` : ''}`,
            data: {
              type: 'order_status_changed',
              orderId,
              orderNumber,
              oldStatus,
              newStatus,
            },
            payload: {
              type: 'order_status_changed',
              orderId,
              orderNumber,
              oldStatus,
              newStatus,
            },
            link: `/orders?orderId=${orderId}`,
            channel: 'in-app',
            isRead: false,
          });
          
          console.log(`✅ Created admin notification in database for admin ${adminId}: Order Status Updated`);

          const adminNotification = {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            body: notification.body,
            data: notification.data,
            payload: notification.payload,
            link: notification.link,
            isRead: notification.isRead,
            createdAt: notification.createdAt,
            updatedAt: notification.updatedAt,
            adminId,
          };

          // Emit via WebSocket to this admin
          if (this.webSocketService) {
            // Emit both 'notification' and 'admin_notification' for compatibility
            this.webSocketService.emitToAdmins('notification', adminNotification);
            this.webSocketService.emitToAdmins('admin_notification', adminNotification);
            console.log(`📬 Admin notification emitted via WebSocket for admin ${adminId}`);
          }

          return adminNotification;
        } catch (error: any) {
          console.error(`❌ Error creating notification for admin ${admin._id}:`, error?.message || error);
          return null;
        }
      });

      const notifications = await Promise.all(notificationPromises);
      console.log(`📢 Admin notification sent to ${admins.length} admin(s) (excluding performer): Order Status Updated`);
    } catch (error: any) {
      console.error('Error sending admin notification:', error?.message || error);
    }
  }

  /**
   * Send notification to seller when a new order contains their products
   */
  async sendNewOrderNotificationToSeller(
    sellerId: string,
    orderId: string,
    orderNumber: string,
    customerName: string,
    totalAmount: number,
    productNames: string[]
  ): Promise<void> {
    try {
      // Get seller user ID
      const seller = await this.Seller.findById(sellerId).populate('user');
      if (!seller) {
        console.error(`Seller ${sellerId} not found`);
        return;
      }
      
      const sellerDoc = seller as any;
      const sellerUser = sellerDoc.user as IUser | undefined;
      if (!sellerUser || !sellerUser._id) {
        console.error(`Seller ${sellerId} has no user`);
        return;
      }

      const sellerUserId = sellerUser._id.toString();
      const productList = productNames.length > 0 
        ? productNames.slice(0, 3).join(', ') + (productNames.length > 3 ? ` and ${productNames.length - 3} more` : '')
        : 'products';

      try {
        await this.createInAppNotification(
          sellerUserId,
          'order',
          'New Order Received',
          `Order #${orderNumber} from ${customerName} - $${totalAmount.toFixed(2)} (${productList})`,
          {
            type: 'order_created',
            orderId,
            orderNumber,
            totalAmount,
            productNames,
          },
          `/seller/orders/${orderId}`,
          'in-app',
          {
            orderId,
            orderNumber,
            totalAmount,
            productNames,
          },
          true // Send email
        );
        console.log(`✅ Seller notification created successfully for seller ${sellerId}, user ${sellerUserId}`);
      } catch (error: any) {
        console.error(`❌ Failed to create seller notification for seller ${sellerId}:`, error?.message || error);
        console.error('Error details:', {
          sellerId,
          sellerUserId,
          orderId,
          error: error?.message,
          stack: error?.stack,
        });
      }
    } catch (error) {
      console.error('Error sending new order notification to seller:', error);
    }
  }

  /**
   * Send notification to seller when order status changes
   * @param excludeSellerId - Seller ID to exclude from notifications (the seller who performed the action)
   */
  async sendOrderStatusChangeNotificationToSeller(
    sellerId: string,
    orderId: string,
    orderNumber: string,
    oldStatus: string,
    newStatus: string,
    customerName?: string,
    excludeSellerId?: string
  ): Promise<void> {
    try {
      // Skip notification if this seller performed the action
      if (excludeSellerId && sellerId === excludeSellerId) {
        console.log(`⏭️ Skipping notification for seller ${sellerId} (performed the action)`);
        return;
      }

      // Get seller user ID
      const seller = await this.Seller.findById(sellerId).populate('user');
      if (!seller) {
        console.error(`Seller ${sellerId} not found`);
        return;
      }
      
      const sellerDoc = seller as any;
      const sellerUser = sellerDoc.user as IUser | undefined;
      if (!sellerUser || !sellerUser._id) {
        console.error(`Seller ${sellerId} has no user`);
        return;
      }

      const sellerUserId = sellerUser._id.toString();

      try {
        await this.createInAppNotification(
          sellerUserId,
          'order',
      'Order Status Updated',
      `Order #${orderNumber} status changed from ${oldStatus} to ${newStatus}${customerName ? ` (Customer: ${customerName})` : ''}`,
      {
        type: 'order_status_changed',
        orderId,
        orderNumber,
        oldStatus,
        newStatus,
      },
          `/seller/orders/${orderId}`,
          'in-app',
          {
            orderId,
            orderNumber,
            oldStatus,
            newStatus,
          },
          true // Send email
        );
        console.log(`✅ Seller order status notification created successfully for seller ${sellerId}, user ${sellerUserId}`);
      } catch (error: any) {
        console.error(`❌ Failed to create seller order status notification for seller ${sellerId}:`, error?.message || error);
        console.error('Error details:', {
          sellerId,
          sellerUserId,
          orderId,
          error: error?.message,
          stack: error?.stack,
        });
      }
    } catch (error) {
      console.error('Error sending order status change notification to seller:', error);
    }
  }

  /**
   * Send notification to seller when a new bid is placed on their product
   */
  async sendNewBidNotificationToSeller(
    sellerId: string,
    bidId: string,
    productId: string,
    productName: string,
    buyerName: string,
    bidPrice: number
  ): Promise<void> {
    try {
      // Get seller user ID
      const seller = await this.Seller.findById(sellerId).populate('user');
      if (!seller) {
        console.error(`Seller ${sellerId} not found`);
        return;
      }
      
      const sellerDoc = seller as any;
      const sellerUser = sellerDoc.user as IUser | undefined;
      if (!sellerUser || !sellerUser._id) {
        console.error(`Seller ${sellerId} has no user`);
        return;
      }

      const sellerUserId = sellerUser._id.toString();

      await this.createInAppNotification(
        sellerUserId,
        'bid',
        'New Bid Received',
        `New bid of $${bidPrice.toFixed(2)} on ${productName} from ${buyerName}`,
        {
          type: 'bid_created',
          bidId,
          productId,
          productName,
          buyerName,
          bidPrice,
        },
        `/seller/bids/${bidId}`,
        'in-app',
        {
          bidId,
          productId,
          productName,
          buyerName,
          bidPrice,
        },
        true // Send email
      );
    } catch (error) {
      console.error('Error sending new bid notification to seller:', error);
    }
  }

  /**
   * Send notification to seller when bid status changes (admin action)
   */
  async sendBidStatusChangeNotificationToSeller(
    sellerId: string,
    bidId: string,
    productName: string,
    oldStatus: string,
    newStatus: string
  ): Promise<void> {
    try {
      // Get seller user ID
      const seller = await this.Seller.findById(sellerId).populate('user');
      if (!seller) {
        console.error(`Seller ${sellerId} not found`);
        return;
      }
      
      const sellerDoc = seller as any;
      const sellerUser = sellerDoc.user as IUser | undefined;
      if (!sellerUser || !sellerUser._id) {
        console.error(`Seller ${sellerId} has no user`);
        return;
      }

      const sellerUserId = sellerUser._id.toString();

      await this.createInAppNotification(
        sellerUserId,
        'bid',
        'Bid Status Updated',
        `Bid on ${productName} status changed from ${oldStatus} to ${newStatus}`,
        {
          type: 'bid_status_changed',
          bidId,
          productName,
          oldStatus,
          newStatus,
        },
        `/seller/bids/${bidId}`,
        'in-app',
        {
          bidId,
          productName,
          oldStatus,
          newStatus,
        },
        false // Don't send email for status changes
      );
    } catch (error) {
      console.error('Error sending bid status change notification to seller:', error);
    }
  }

  /**
   * Send notification to seller when a payout is created
   */
  async sendPayoutNotificationToSeller(
    sellerId: string,
    payoutId: string,
    orderId: string,
    amount: number
  ): Promise<void> {
    try {
      // Get seller user ID
      const seller = await this.Seller.findById(sellerId).populate('user');
      if (!seller) {
        console.error(`Seller ${sellerId} not found`);
        return;
      }
      
      const sellerDoc = seller as any;
      const sellerUser = sellerDoc.user as IUser | undefined;
      if (!sellerUser || !sellerUser._id) {
        console.error(`Seller ${sellerId} has no user`);
        return;
      }

      const sellerUserId = sellerUser._id.toString();

      await this.createInAppNotification(
        sellerUserId,
        'payment',
        'New Payout Created',
        `A payout of $${amount.toFixed(2)} has been created for your order. Status: PENDING`,
        {
          type: 'payout_created',
          payoutId,
          orderId,
          amount,
          status: 'PENDING',
        },
        `/seller/earnings`,
        'in-app',
        {
          payoutId,
          orderId,
          amount,
          status: 'PENDING',
        },
        true // Send email
      );
    } catch (error) {
      console.error('Error sending payout notification to seller:', error);
    }
  }

  /**
   * Send notification to seller when payout status changes
   */
  async sendPayoutStatusChangeNotificationToSeller(
    sellerId: string,
    payoutId: string,
    orderId: string,
    oldStatus: string,
    newStatus: string,
    amount: number
  ): Promise<void> {
    try {
      // Get seller user ID
      const seller = await this.Seller.findById(sellerId).populate('user');
      if (!seller) {
        console.error(`Seller ${sellerId} not found`);
        return;
      }
      
      const sellerDoc = seller as any;
      const sellerUser = sellerDoc.user as IUser | undefined;
      if (!sellerUser || !sellerUser._id) {
        console.error(`Seller ${sellerId} has no user`);
        return;
      }

      const sellerUserId = sellerUser._id.toString();

      const statusMessages: { [key: string]: string } = {
        'PROCESSED': 'Your payout has been processed successfully!',
        'FAILED': 'Your payout processing failed. Please contact support.',
        'PENDING': 'Your payout is pending processing.',
      };

      await this.createInAppNotification(
        sellerUserId,
        'payment',
        'Payout Status Updated',
        statusMessages[newStatus] || `Payout status changed from ${oldStatus} to ${newStatus}`,
        {
          type: 'payout_status_changed',
          payoutId,
          orderId,
          oldStatus,
          newStatus,
          amount,
        },
        `/seller/earnings`,
        'in-app',
        {
          payoutId,
          orderId,
          oldStatus,
          newStatus,
          amount,
        },
        true // Send email
      );
    } catch (error) {
      console.error('Error sending payout status change notification to seller:', error);
    }
  }

  /**
   * Send notification to seller when order status becomes COMPLETE
   */
  async sendOrderCompleteNotificationToSeller(
    sellerId: string,
    orderId: string,
    orderNumber: string,
    amount: number,
    customerName?: string
  ): Promise<void> {
    try {
      // Get seller user ID
      const seller = await this.Seller.findById(sellerId).populate('user');
      if (!seller) {
        console.error(`Seller ${sellerId} not found`);
        return;
      }
      
      const sellerDoc = seller as any;
      const sellerUser = sellerDoc.user as IUser | undefined;
      if (!sellerUser || !sellerUser._id) {
        console.error(`Seller ${sellerId} has no user`);
        return;
      }

      const sellerUserId = sellerUser._id.toString();

      await this.createInAppNotification(
        sellerUserId,
        'order',
        'Order Completed',
        `Order #${orderNumber} has been completed. Amount: $${amount.toFixed(2)}${customerName ? ` (Customer: ${customerName})` : ''}. A payout has been created for this order.`,
        {
          type: 'order_completed',
          orderId,
          orderNumber,
          amount,
          customerName,
        },
        `/seller/earnings`,
        'in-app',
        {
          orderId,
          orderNumber,
          amount,
          customerName,
        },
        true // Send email
      );
    } catch (error) {
      console.error('Error sending order complete notification to seller:', error);
    }
  }

  /**
   * Send notification to admins when a new product is created
   */
  async sendNewProductNotificationToAdmins(
    productId: string,
    productName: string,
    sellerName: string,
    productType: string
  ): Promise<void> {
    return this.sendAdminNotification(
      'New Product Added',
      `New ${productType} product "${productName}" has been added by seller ${sellerName}`,
      {
        type: 'product_created',
        productId,
        productName,
        sellerName,
        productType,
      },
      `/products?productId=${productId}`,
      true // Send email
    );
  }

  /**
   * Send notification to admins when a new bid is created
   */
  async sendNewBidNotificationToAdmins(
    bidId: string,
    productId: string,
    productName: string,
    buyerName: string,
    bidPrice: number
  ): Promise<void> {
    return this.sendAdminNotification(
      'New Bid Received',
      `New bid of $${bidPrice.toFixed(2)} on "${productName}" from ${buyerName}`,
      {
        type: 'bid_created',
        bidId,
        productId,
        productName,
        buyerName,
        bidPrice,
      },
      `/bids?bidId=${bidId}`,
      true // Send email
    );
  }
}
