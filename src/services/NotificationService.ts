import { injectable, inject } from 'inversify';
import { Model } from 'mongoose';
import { IUser, INotification, NotificationEntityType, NotificationType, NotificationTarget } from '../models';
import TYPES from '../di';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { notificationBus } from '../utils/notificationBus';
import { NotificationDto, serializeNotification } from '../utils/notificationSerializer';

export interface EmitNotificationInput {
  userId: string;
  type: NotificationType;
  target: NotificationTarget;
  title: string;
  body: string;
  actionUrl?: string;
  entityType?: NotificationEntityType;
  entityId?: string;
  conversationId?: string;
  dedupeKey?: string;
  data?: Record<string, unknown>;
  /** Skip Expo push (in-app only) */
  inAppOnly?: boolean;
}

@injectable()
export class NotificationService {
  private expo: Expo;

  constructor(@inject(TYPES.User) private User: Model<IUser>, @inject(TYPES.Notification) private Notification: Model<INotification>) {
    this.expo = new Expo();
  }

  /**
   * Create in-app notification with optional dedupe. Emits on notificationBus for SSE.
   */
  async emit(input: EmitNotificationInput): Promise<NotificationDto | null> {
    const {
      userId,
      type,
      target,
      title,
      body,
      actionUrl,
      entityType,
      entityId,
      conversationId,
      dedupeKey,
      data = {},
      inAppOnly = false,
    } = input;

    try {
      if (dedupeKey) {
        const existing = await this.Notification.findOne({ user: userId, dedupeKey }).lean();
        if (existing) {
          return serializeNotification(existing as INotification);
        }
      }

      const doc = await this.Notification.create({
        user: userId,
        type,
        target,
        title,
        message: body,
        body,
        actionUrl,
        link: actionUrl,
        entityType,
        entityId,
        conversationId: conversationId || undefined,
        dedupeKey,
        data,
        isRead: false,
      });

      const dto = serializeNotification(doc);
      notificationBus.emitForUser(userId, dto);

      if (!inAppOnly) {
        void this.sendExpoPush(userId, title, body, {
          ...data,
          type,
          entityType,
          entityId,
          conversationId,
          actionUrl,
        });
        void this.sendOneSignalPush(userId, title, body, {
          ...data,
          type,
          entityType,
          entityId,
          conversationId,
          actionUrl,
        });
      }

      return dto;
    } catch (error: unknown) {
      const err = error as { code?: number };
      if (err?.code === 11000 && dedupeKey) {
        const existing = await this.Notification.findOne({ user: userId, dedupeKey }).lean();
        return existing ? serializeNotification(existing as INotification) : null;
      }
      console.error('Error emitting notification:', error);
      return null;
    }
  }

  private async sendExpoPush(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown>
  ): Promise<ExpoPushTicket[]> {
    try {
      const user = await this.User.findById(userId);
      if (!user?.pushTokens?.length) {
        return [];
      }

      const messages: ExpoPushMessage[] = [];
      for (const pushToken of user.pushTokens) {
        if (!Expo.isExpoPushToken(pushToken)) continue;
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

      if (!messages.length) return [];

      const chunks = this.expo.chunkPushNotifications(messages);
      const tickets: ExpoPushTicket[] = [];
      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error('Error sending push notification chunk:', error);
        }
      }
      return tickets;
    } catch (error) {
      console.error('Error in sendExpoPush:', error);
      return [];
    }
  }

  private async sendOneSignalPush(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const appId = process.env.ONESIGNAL_APP_ID;
    const restKey = process.env.ONESIGNAL_REST_API_KEY;
    if (!appId || !restKey) return;

    try {
      const user = await this.User.findById(userId);
      const subscriptionIds = (user?.pushTokens ?? [])
        .filter((token) => token.startsWith('onesignal:'))
        .map((token) => token.replace(/^onesignal:/, ''))
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        app_id: appId,
        target_channel: 'push',
        headings: { en: title },
        contents: { en: body },
        data,
      };

      if (subscriptionIds.length) {
        payload.include_subscription_ids = subscriptionIds;
      } else {
        payload.include_aliases = { external_id: [String(userId)] };
      }

      const response = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${restKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('OneSignal push failed:', response.status, errorBody);
      }
    } catch (error) {
      console.error('Error in sendOneSignalPush:', error);
    }
  }

  async getUnreadCount(userId: string, target?: 'buyer' | 'seller'): Promise<number> {
    const targetFilter = target === 'seller'
      ? { $in: ['seller', 'both'] }
      : target === 'buyer'
        ? { $in: ['buyer', 'both'] }
        : undefined;
    const query: Record<string, unknown> = { user: userId, isRead: false };
    if (targetFilter) query.target = targetFilter;
    return this.Notification.countDocuments(query);
  }

  async markConversationNotificationsAsRead(
    userId: string,
    conversationId: string
  ): Promise<number> {
    const result = await this.Notification.updateMany(
      {
        user: userId,
        isRead: false,
        $or: [{ conversationId }, { 'data.conversationId': conversationId }],
      },
      { isRead: true }
    );
    return result.modifiedCount ?? 0;
  }

  async markOfferNotificationsAsRead(userId: string, offerId: string): Promise<number> {
    const result = await this.Notification.updateMany(
      {
        user: userId,
        isRead: false,
        $or: [
          { entityType: 'offer', entityId: offerId },
          { type: { $in: ['offer', 'bid'] }, 'data.offerId': offerId },
        ],
      },
      { isRead: true }
    );
    return result.modifiedCount ?? 0;
  }

  async getSellerUnreadSummary(userId: string, target?: 'buyer' | 'seller'): Promise<{
    total: number;
    messages: number;
    offers: number;
    orders: number;
    payments: number;
  }> {
    const targetFilter = target === 'seller'
      ? { $in: ['seller', 'both'] }
      : target === 'buyer'
        ? { $in: ['buyer', 'both'] }
        : undefined;
    const query: Record<string, unknown> = {
      user: userId,
      isRead: false,
      type: { $in: ['message', 'offer', 'bid', 'order', 'payment'] },
    };
    if (targetFilter) query.target = targetFilter;
    const rows = await this.Notification.find(query)
      .select('type')
      .lean();

    const counts = { messages: 0, offers: 0, orders: 0, payments: 0 };
    for (const row of rows) {
      const type = String(row.type || '');
      if (type === 'message') counts.messages += 1;
      else if (type === 'offer' || type === 'bid') counts.offers += 1;
      else if (type === 'order') counts.orders += 1;
      else if (type === 'payment') counts.payments += 1;
    }

    return {
      ...counts,
      total: counts.messages + counts.offers + counts.orders + counts.payments,
    };
  }

  // ——— Marketplace ———

  async notifyOfferCreatedToSeller(params: {
    sellerUserId: string;
    buyerName: string;
    productName: string;
    amount: number;
    offerId: string;
    productId: string;
    conversationId: string;
  }): Promise<NotificationDto | null> {
    const { sellerUserId, buyerName, productName, amount, offerId, productId, conversationId } = params;
    return this.emit({
      userId: sellerUserId,
      type: 'offer',
      target: 'seller',
      title: 'New offer',
      body: `${buyerName} offered $${amount.toFixed(2)} on ${productName}`,
      actionUrl: `/conversations`,
      entityType: 'offer',
      entityId: offerId,
      conversationId,
      dedupeKey: `offer:${offerId}:created`,
      data: { offerId, productId, conversationId, type: 'offer_created' },
    });
  }

  async notifyOfferAcceptedToBuyer(params: {
    buyerId: string;
    productName: string;
    productId: string;
    offerId: string;
    conversationId: string;
    amount: number;
  }): Promise<NotificationDto | null> {
    const { buyerId, productName, productId, offerId, conversationId, amount } = params;
    return this.emit({
      userId: buyerId,
      type: 'offer',
      target: 'buyer',
      title: 'Offer accepted',
      body: `Your offer of $${amount.toFixed(2)} on ${productName} was accepted. Add to cart within 24 hours.`,
      actionUrl: '/conversations',
      entityType: 'offer',
      entityId: offerId,
      conversationId,
      dedupeKey: `offer:${offerId}:accepted`,
      data: { offerId, productId, conversationId, type: 'offer_accepted', bidAmount: amount },
    });
  }

  async notifyOfferRejectedToBuyer(params: {
    buyerId: string;
    productName: string;
    productId: string;
    offerId: string;
    conversationId: string;
  }): Promise<NotificationDto | null> {
    const { buyerId, productName, productId, offerId, conversationId } = params;
    return this.emit({
      userId: buyerId,
      type: 'offer',
      target: 'buyer',
      title: 'Offer declined',
      body: `Your offer on ${productName} was not accepted.`,
      actionUrl: '/conversations',
      entityType: 'offer',
      entityId: offerId,
      conversationId,
      dedupeKey: `offer:${offerId}:rejected`,
      data: { offerId, productId, conversationId, type: 'offer_rejected' },
    });
  }

  async notifyCounterOfferToBuyer(params: {
    buyerId: string;
    productName: string;
    productId: string;
    offerId: string;
    conversationId: string;
    amount: number;
  }): Promise<NotificationDto | null> {
    const { buyerId, productName, productId, offerId, conversationId, amount } = params;
    return this.emit({
      userId: buyerId,
      type: 'offer',
      target: 'buyer',
      title: 'Counter offer received',
      body: `Seller countered with $${amount.toFixed(2)} for ${productName}`,
      actionUrl: '/conversations',
      entityType: 'offer',
      entityId: offerId,
      conversationId,
      dedupeKey: `offer:${offerId}:counter`,
      data: { offerId, productId, conversationId, type: 'counter_offer', counterAmount: amount },
    });
  }

  async notifyNewMessage(params: {
    recipientId: string;
    senderLabel: string;
    preview: string;
    messageId: string;
    conversationId: string;
    productId?: string;
    recipientRole: 'buyer' | 'seller' | 'admin';
  }): Promise<NotificationDto | null> {
    const { recipientId, senderLabel, preview, messageId, conversationId, productId, recipientRole } =
      params;
    const actionUrl =
      recipientRole === 'seller' ? '/conversations' : '/conversations';

    return this.emit({
      userId: recipientId,
      type: 'message',
      target: recipientRole === 'seller' ? 'seller' : 'buyer',
      title: `Message from ${senderLabel}`,
      body: preview.length > 120 ? `${preview.slice(0, 117)}...` : preview,
      actionUrl,
      entityType: 'message',
      entityId: messageId,
      conversationId,
      dedupeKey: `message:${messageId}`,
      data: { messageId, conversationId, productId, type: 'new_message' },
      inAppOnly: false,
    });
  }

  async notifyOrderPendingApproval(params: {
    approverUserIds: string[];
    orderId: string;
    orderNumber: string;
    forSeller: boolean;
  }): Promise<void> {
    const { approverUserIds, orderId, orderNumber, forSeller } = params;
    const actionUrl = forSeller ? '/orders' : '/orders';
    const title = forSeller ? 'New order to review' : 'New order pending approval';
    const body = forSeller
      ? `Order #${orderNumber} is waiting for your approval.`
      : `Order #${orderNumber} requires admin approval.`;

    await Promise.all(
      approverUserIds.map((userId) =>
        this.emit({
          userId,
          type: 'order',
          target: forSeller ? 'seller' : 'buyer',
          title,
          body,
          actionUrl,
          entityType: 'order',
          entityId: orderId,
          dedupeKey: `order:${orderId}:pending:${userId}`,
          data: { orderId, orderNumber, type: 'order_pending_approval', forSeller },
        })
      )
    );
  }

  async notifyOrderCancelledByBuyerForSellers(params: {
    sellerUserIds: string[];
    orderId: string;
    orderNumber: string;
  }): Promise<void> {
    const { sellerUserIds, orderId, orderNumber } = params;
    await Promise.all(
      sellerUserIds.map((userId) =>
        this.emit({
          userId,
          type: 'order',
          target: 'seller',
          title: 'Order cancelled by buyer',
          body: `Order #${orderNumber} was cancelled by the buyer before confirmation.`,
          actionUrl: '/orders',
          entityType: 'order',
          entityId: orderId,
          dedupeKey: `order:${orderId}:cancelled_by_buyer:${userId}`,
          data: {
            orderId,
            orderNumber,
            type: 'order_cancelled_by_buyer',
          },
        })
      )
    );
  }

  async notifyOrderCreated(params: {
    userId: string;
    orderId: string;
    orderNumber: string;
  }): Promise<NotificationDto | null> {
    const { userId, orderId, orderNumber } = params;
    return this.emit({
      userId,
      type: 'order',
      target: 'buyer',
      title: 'Order placed',
      body: `Order #${orderNumber} was received. We'll keep you updated.`,
      actionUrl: '/profile?tab=orders',
      entityType: 'order',
      entityId: orderId,
      dedupeKey: `order:${orderId}:created`,
      data: { orderId, orderNumber, type: 'order_created' },
    });
  }

  async notifyOrderStatus(params: {
    userId: string;
    orderId: string;
    status: string;
    orderNumber?: string;
  }): Promise<NotificationDto | null> {
    const { userId, orderId, status, orderNumber } = params;
    const statusMessages: Record<string, string> = {
      PENDING: 'Your order has been received',
      CONFIRMED: 'Your order has been confirmed',
      PROCESSING: 'Your order is being prepared',
      SHIPPED: 'Your order has been shipped',
      OUT_FOR_DELIVERY: 'Your order is out for delivery',
      DELIVERED: 'Your order has been delivered',
      COMPLETE: 'Your order is complete',
      CANCELLED: 'Your order has been cancelled',
      CANCELLED_BY_BUYER: 'You cancelled this order',
    };
    const message = statusMessages[status] || 'Your order status has been updated';
    const displayOrderNumber = orderNumber || orderId.substring(0, 8);

    return this.emit({
      userId,
      type: 'order',
      target: 'buyer',
      title: 'Order update',
      body: `Order #${displayOrderNumber}: ${message}`,
      actionUrl: '/profile?tab=orders',
      entityType: 'order',
      entityId: orderId,
      dedupeKey: `order:${orderId}:status:${status}`,
      data: { orderId, status, orderNumber: displayOrderNumber, type: 'order_status' },
    });
  }

  // ——— Legacy helpers (delegate to emit) ———

  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {}
  ): Promise<ExpoPushTicket[]> {
    const type = this.inferTypeFromData(data);
    await this.emit({
      userId,
      type,
      target: this.inferTargetFromData(data),
      title,
      body,
      actionUrl: this.inferActionUrl(data),
      entityType: data.orderId ? 'order' : data.offerId || data.bidId ? 'offer' : data.productId ? 'product' : undefined,
      entityId: String(data.orderId || data.offerId || data.bidId || data.productId || '') || undefined,
      conversationId: data.conversationId ? String(data.conversationId) : undefined,
      data,
    });
    return [];
  }

  private inferTargetFromData(data: Record<string, unknown>): NotificationTarget {
    const t = String(data.type || '');
    if (t.includes('seller') || t === 'order_pending_approval' || t === 'order_cancelled_by_buyer') return 'seller';
    if (t.includes('buyer') || t === 'order_created' || t === 'order_status' || t === 'offer_accepted' || t === 'offer_rejected' || t === 'counter_offer' || t === 'cart_reminder' || t === 'price_drop' || t === 'flash_sale') return 'buyer';
    return 'buyer';
  }

  private inferTypeFromData(data: Record<string, unknown>): NotificationType {
    const t = String(data.type || '');
    if (t.includes('order')) return 'order';
    if (t.includes('offer') || t.includes('bid') || t.includes('counter')) return 'offer';
    if (t.includes('message')) return 'message';
    if (t.includes('product') || t.includes('price') || t.includes('flash')) return 'product';
    if (t.includes('cart')) return 'promotional';
    return 'account';
  }

  private inferActionUrl(data: Record<string, unknown>): string | undefined {
    if (data.orderId) return '/profile?tab=orders';
    if (data.conversationId || data.offerId || data.bidId) return '/conversations';
    if (data.productId) return `/product/${data.productId}`;
    return undefined;
  }

  async sendBidAcceptedNotification(
    userId: string,
    productName: string,
    productId: string,
    bidAmount: number,
    offerId?: string,
    conversationId?: string
  ): Promise<ExpoPushTicket[]> {
    await this.notifyOfferAcceptedToBuyer({
      buyerId: userId,
      productName,
      productId,
      offerId: offerId || productId,
      conversationId: conversationId || '',
      amount: bidAmount,
    });
    return [];
  }

  async sendBidRejectedNotification(
    userId: string,
    productName: string,
    productId: string,
    offerId?: string,
    conversationId?: string
  ): Promise<ExpoPushTicket[]> {
    await this.notifyOfferRejectedToBuyer({
      buyerId: userId,
      productName,
      productId,
      offerId: offerId || productId,
      conversationId: conversationId || '',
    });
    return [];
  }

  async sendCounterOfferNotification(
    userId: string,
    productName: string,
    productId: string,
    counterAmount: number,
    offerId?: string,
    conversationId?: string
  ): Promise<ExpoPushTicket[]> {
    await this.notifyCounterOfferToBuyer({
      buyerId: userId,
      productName,
      productId,
      offerId: offerId || productId,
      conversationId: conversationId || '',
      amount: counterAmount,
    });
    return [];
  }

  async sendBidMessageNotification(
    userId: string,
    productName: string,
    productId: string,
    message: string,
    messageId?: string,
    conversationId?: string
  ): Promise<ExpoPushTicket[]> {
    await this.notifyNewMessage({
      recipientId: userId,
      senderLabel: productName,
      preview: message,
      messageId: messageId || `legacy-${Date.now()}`,
      conversationId: conversationId || '',
      productId,
      recipientRole: 'buyer',
    });
    return [];
  }

  async sendOrderStatusNotification(
    userId: string,
    orderId: string,
    status: string,
    orderNumber?: string
  ): Promise<ExpoPushTicket[]> {
    await this.notifyOrderStatus({ userId, orderId, status, orderNumber });
    return [];
  }

  async sendFlashSaleNotification(
    userId: string,
    productName: string,
    productId: string,
    discount: number
  ): Promise<ExpoPushTicket[]> {
    await this.emit({
      userId,
      type: 'product',
      target: 'buyer',
      title: 'Flash sale',
      body: `${productName} is now ${discount}% off!`,
      actionUrl: `/product/${productId}`,
      entityType: 'product',
      entityId: productId,
      data: { productId, discount, type: 'flash_sale' },
      dedupeKey: `product:${productId}:flash:${discount}`,
    });
    return [];
  }

  async sendPriceDropNotification(
    userId: string,
    productName: string,
    productId: string,
    oldPrice: number,
    newPrice: number
  ): Promise<ExpoPushTicket[]> {
    const discount = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
    await this.emit({
      userId,
      type: 'product',
      target: 'buyer',
      title: 'Price drop',
      body: `${productName} dropped from $${oldPrice} to $${newPrice} (${discount}% off)`,
      actionUrl: `/product/${productId}`,
      entityType: 'product',
      entityId: productId,
      dedupeKey: `product:${productId}:price:${newPrice}`,
      data: { productId, oldPrice, newPrice, type: 'price_drop' },
    });
    return [];
  }

  async sendCartReminderNotification(userId: string, itemCount: number): Promise<ExpoPushTicket[]> {
    await this.emit({
      userId,
      type: 'promotional',
      target: 'buyer',
      title: 'Items in your cart',
      body: `You have ${itemCount} item${itemCount > 1 ? 's' : ''} waiting. Complete your purchase!`,
      actionUrl: '/carte',
      data: { type: 'cart_reminder', itemCount },
    });
    return [];
  }

  async savePushToken(userId: string, token: string): Promise<void> {
    if (token.startsWith('onesignal:')) {
      const subscriptionId = token.replace(/^onesignal:/, '').trim();
      if (!subscriptionId) {
        throw new Error('Invalid OneSignal subscription id');
      }
      await this.User.findByIdAndUpdate(userId, { $addToSet: { pushTokens: token } }, { new: true });
      return;
    }

    if (!Expo.isExpoPushToken(token)) {
      throw new Error('Invalid Expo push token format');
    }
    await this.User.findByIdAndUpdate(userId, { $addToSet: { pushTokens: token } }, { new: true });
  }

  async removePushToken(userId: string, token: string): Promise<void> {
    await this.User.findByIdAndUpdate(userId, { $pull: { pushTokens: token } }, { new: true });
  }

  async removeAllPushTokens(userId: string): Promise<void> {
    await this.User.findByIdAndUpdate(userId, { $set: { pushTokens: [] } }, { new: true });
  }

  async sendBulkNotifications(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    await Promise.all(userIds.map((userId) => this.sendPushNotification(userId, title, body, data)));
  }
}
