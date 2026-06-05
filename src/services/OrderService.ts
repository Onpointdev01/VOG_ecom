import { injectable, inject } from 'inversify';
import { BaseService } from './BaseService';
import { Order, IOrder, IOrderItem, OrderApprovalActor } from '../models/Order';
import { Cart, ICart } from '../models/Cart';
import { Product } from '../models/Product';
import { ProductVariant } from '../models/ProductVariant';
import { Address, IAddress } from '../models/Address';
import { PaymentOption, PaymentMethodType } from '../models/PaymentOption';
import { PaymentService } from './PaymentService';
import { IShippingZoneService } from './ShippingZoneService';
import { NotificationService } from './NotificationService';
import { IMarketingCampaignService } from './MarketingCampaignService';
import { Payment, PaymentMethod } from '../models/Payment';
import AppError from '../utils/errors/AppError';
import { TYPES } from '../di';
import { ProductAvailabilityService } from './ProductAvailabilityService';
import { PlatformSettingsService } from './PlatformSettingsService';
import { User } from '../models/User';
import { Admin } from '../models/Admin';
import { Seller } from '../models/Seller';
import { toIdString } from '../utils/mongoId';
import { resolveAdminChatUserId } from '../utils/resolveAdminChatUser';
import { isVariableProductType } from '../utils/productAvailability';
import {
  computeSellerItemsTotal,
  filterOrderItemsForSeller,
  mapOrderItemsForResponse,
  OrderItemLike,
} from '../utils/orderSellerScope';
import {
  applyExcludeCancelledFromOrderList,
  excludeCancelledOrdersClause,
  HIDDEN_CANCELLED_ORDER_STATUSES,
} from '../utils/orderListFilters';

export interface CreateOrderRequest {
  userId: string;
  paymentMethod: PaymentMethodType;
  shippingAddressId: string;
  selectedItems?: string[];
  notes?: string;
  couponCode?: string;
}

/** Order statuses where the buyer may cancel (seller has not confirmed yet). */
export const BUYER_CANCELLABLE_ORDER_STATUSES = ['PENDING'] as const;

@injectable()
export class OrderService extends BaseService {
  constructor(
    @inject(TYPES.PaymentService) private paymentService: PaymentService,
    @inject(TYPES.ShippingZoneService) private shippingZoneService: IShippingZoneService,
    @inject(TYPES.NotificationService) private notificationService: NotificationService,
    @inject(TYPES.MarketingCampaignService)
    private marketingCampaignService: IMarketingCampaignService,
    @inject(TYPES.ProductAvailabilityService)
    private productAvailability: ProductAvailabilityService,
    @inject(TYPES.PlatformSettingsService)
    private platformSettingsService: PlatformSettingsService
  ) {
    super();
  }
  async createOrder(data: CreateOrderRequest): Promise<IOrder> {
    const { userId, paymentMethod, shippingAddressId, selectedItems, notes, couponCode } = data;

    // Verify user's cart exists and has items
    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      throw new AppError('Cart is empty', 400);
    }

    // Filter items based on selection (partial checkout)
    let itemsToOrder = cart.items;
    if (selectedItems && selectedItems.length > 0) {
      itemsToOrder = cart.items.filter(item => 
        selectedItems.includes(item._id.toString())
      );
      
      if (itemsToOrder.length === 0) {
        throw new AppError('No valid items selected for checkout', 400);
      }
    }

    // Verify payment method exists and is enabled
    const paymentOption = await PaymentOption.findOne({ 
      code: paymentMethod, 
      isEnabled: true 
    });
    if (!paymentOption) {
      throw new AppError('Payment method not available', 400);
    }

    // Verify shipping address exists and belongs to user
    const shippingAddress = await Address.findOne({ 
      _id: shippingAddressId, 
      user: userId 
    });
    if (!shippingAddress) {
      throw new AppError('Shipping address not found', 404);
    }

    for (const item of itemsToOrder) {
      const productRef = item.product as { _id?: { toString(): string }; id?: string };
      const pid =
        productRef?._id?.toString?.() ||
        (typeof item.product === 'string' ? item.product : productRef?.id);
      if (pid) {
        await this.productAvailability.assertPurchasable(pid, item.quantity);
      }
    }

    const totalPrice = itemsToOrder.reduce((sum, item) => {
      let itemPrice = item.price;
      
      // If cart item doesn't have price, get it from the populated product
      if (typeof itemPrice !== 'number' || isNaN(itemPrice) || itemPrice < 0) {
        const product = item.product as any;
        if (product && typeof product.price === 'number') {
          itemPrice = product.price;
        } else {
          throw new AppError(`Invalid price for item: ${product?.name || 'Unknown product'}. Please refresh your cart and try again.`, 400);
        }
      }
      
      return sum + (itemPrice * item.quantity);
    }, 0);
    
    if (isNaN(totalPrice) || totalPrice < 0) {
      throw new AppError('Unable to calculate order total. Please check your cart items and try again.', 400);
    }

    // Calculate shipping fee based on province
    const shippingFee = await this.calculateShippingFee(shippingAddress);

    const discount = await this.marketingCampaignService.resolveCouponForOrder(
      userId,
      couponCode,
      totalPrice,
      shippingFee
    );
    const discountAmount = discount.discountAmount;
    const finalPrice = Math.max(0, totalPrice + shippingFee - discountAmount);

    // Store cart item IDs for later clearing
    const cartItemIdsToRemove = selectedItems && selectedItems.length > 0 
      ? selectedItems 
      : cart.items.map(item => item._id.toString());

    // Generate order number
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const orderNumber = `ORD-${timestamp}-${random}`;

    // Create order
    const order = new Order({
      user: userId,
      items: itemsToOrder.map(item => {
        let itemPrice = item.price;
        
        // Ensure we have a valid price for the order item
        if (typeof itemPrice !== 'number' || isNaN(itemPrice) || itemPrice < 0) {
          const product = item.product as any;
          if (product && typeof product.price === 'number') {
            itemPrice = product.price;
          } else {
            throw new AppError(`Cannot create order: Invalid price for item ${product?.name || 'Unknown product'}`, 400);
          }
        }
        
        return {
          product: item.product,
          quantity: item.quantity,
          variantId: item.variantId,
          sku: item.sku,
          size: item.size,
          color: item.color,
          price: itemPrice,
          bidId: item.bidId,
          offerId: item.offerId,
        };
      }),
      shippingAddress: {
        fullName: shippingAddress.fullName,
        phoneNumber: shippingAddress.phoneNumber,
        homeAddress: shippingAddress.homeAddress,
        neighborhood: shippingAddress.neighborhood,
        state: shippingAddress.state,
        city: shippingAddress.city,
        postalCode: shippingAddress.postalCode,
        country: shippingAddress.country,
      },
      paymentMethod,
      totalPrice,
      shippingFee,
      discountAmount,
      campaignId: discount.campaignId,
      couponCode: discount.couponCode,
      finalPrice,
      orderNumber,
      notes,
      cartItemIds: cartItemIdsToRemove,
      paymentStatus: paymentMethod === 'CASH_ON_DELIVERY' ? 'PENDING' : 'PENDING',
      orderStatus: 'PENDING',
    });

    try {
      await order.save();

      // Decrement product quantities after successful order creation
      await this.decrementProductQuantities(itemsToOrder);
    } catch (error: any) {
      console.error('Order save error:', error);
      console.error('Order data:', JSON.stringify(order.toObject(), null, 2));

      // Transform validation errors to user-friendly messages
      if (error.name === 'ValidationError') {
        const validationErrors = Object.keys(error.errors).map(key =>
          `${key}: ${error.errors[key].message}`
        ).join(', ');

        console.error('Validation errors:', validationErrors);

        if (error.message.includes('totalPrice') || error.message.includes('finalPrice')) {
          throw new AppError('Unable to process order due to pricing issues. Please refresh your cart and try again.', 400);
        }
        if (error.message.includes('orderNumber')) {
          throw new AppError('Order processing failed. Please try again.', 500);
        }
        if (error.message.includes('price') && error.message.includes('required')) {
          throw new AppError('Product pricing information is missing. Please refresh your cart and try again.', 400);
        }
        // Generic validation error with more details
        throw new AppError(`Order validation failed: ${validationErrors}`, 400);
      }
      // Re-throw other errors as-is
      throw error;
    }

    // Create Payment record for the order
    try {
      const payment = await this.paymentService.createPayment({
        orderId: (order._id as string).toString(),
        userId: userId,
        paymentMethod: paymentMethod as PaymentMethod,
        amount: finalPrice,
        phoneNumber: undefined, // Will be handled by payment processing
        description: `Payment for order ${orderNumber}`,
        currency: 'XAF'
      });

      // Link payment to order
      order.activePayment = payment._id as any;
      order.payments = [payment._id as any];
      await order.save();

    } catch (error: any) {
      console.error('Payment creation error:', error);
      // If payment creation fails, we should still return the order
      // but log the error for investigation
      console.error(`Failed to create payment for order ${(order._id as string).toString()}: ${error.message}`);
    }

    // DON'T clear cart yet - wait for confirmation or payment
    try {
      await this.notificationService.notifyOrderCreated({
        userId,
        orderId: (order._id as { toString(): string }).toString(),
        orderNumber,
      });
      await this.notifyOrderApprovers(order);
    } catch (error) {
      console.error('Failed to send order created notification:', error);
    }

    return order;
  }

  private async notifyOrderApprovers(order: IOrder): Promise<void> {
    const orderId = toIdString(order._id);
    const orderNumber = order.orderNumber;
    const mode = await this.platformSettingsService.getOrderApprovalMode();

    if (mode === 'SELLER_ALLOWED') {
      const productIds = order.items.map((item) => toIdString(item.product));
      const products = await Product.find({ _id: { $in: productIds } })
        .select('owner')
        .lean();
      const sellerIds = Array.from(
        new Set(products.map((p) => toIdString(p.owner)).filter(Boolean))
      );
      if (sellerIds.length === 0) return;

      const sellers = await Seller.find({ _id: { $in: sellerIds } })
        .select('user name')
        .lean();
      const sellerUserIds = Array.from(
        new Set(sellers.map((s) => toIdString(s.user)).filter(Boolean))
      );

      await this.notificationService.notifyOrderPendingApproval({
        approverUserIds: sellerUserIds,
        orderId,
        orderNumber,
        forSeller: true,
      });
      return;
    }

    const adminDocs = await Admin.find({ isActive: true });
    if (adminDocs.length === 0) return;

    const adminUserIds: string[] = [];
    for (const admin of adminDocs) {
      try {
        const uid = await resolveAdminChatUserId(admin, User);
        if (uid) adminUserIds.push(uid);
      } catch {
        // skip admin without resolvable inbox
      }
    }

    if (adminUserIds.length === 0) return;

    await this.notificationService.notifyOrderPendingApproval({
      approverUserIds: adminUserIds,
      orderId,
      orderNumber,
      forSeller: false,
    });
  }

  async getOrderById(orderId: string): Promise<IOrder> {
    // Don't populate user for ownership checks - populate only items.product
    return this.verifyDoc(orderId, Order, 'items.product');
  }

  async getUserOrders(userId: string, options?: { limit?: number; status?: string; page?: number }): Promise<IOrder[]> {
    const baseFilter: Record<string, unknown> = { user: userId };

    // Handle status filtering
    if (options?.status) {
      if (options.status === 'recent') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        baseFilter.createdAt = { $gte: thirtyDaysAgo };
      } else if (
        !HIDDEN_CANCELLED_ORDER_STATUSES.includes(
          options.status.toUpperCase() as (typeof HIDDEN_CANCELLED_ORDER_STATUSES)[number]
        )
      ) {
        baseFilter.orderStatus = options.status.toUpperCase();
      }
    }

    const filter = applyExcludeCancelledFromOrderList(baseFilter);

    let query = Order.find(filter)
      .populate('items.product')
      .sort({ createdAt: -1 });

    // Handle pagination
    if (options?.page && options?.limit) {
      const skip = (options.page - 1) * options.limit;
      query = query.skip(skip);
    }

    // Handle limit
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return query.exec();
  }

  async getAllOrders(filter: any = {}, options: { page: number; limit: number }): Promise<{ orders: IOrder[]; total: number; page: number; totalPages: number }> {
    const { page, limit } = options;
    const skip = (page - 1) * limit;
    const listFilter = applyExcludeCancelledFromOrderList(filter);

    const orders = await Order.find(listFilter)
      .populate('items.product')
      .populate('user', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Order.countDocuments(listFilter);
    const totalPages = Math.ceil(total / limit);
    
    return {
      orders,
      total,
      page,
      totalPages,
    };
  }

  async updateOrderStatus(
    orderId: string,
    orderStatus: string,
    actor?: { userId: string; role: OrderApprovalActor }
  ): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);

    const previousStatus = order.orderStatus;
    this.applyApprovalMetadata(order, previousStatus, orderStatus, actor);
    order.orderStatus = orderStatus as IOrder['orderStatus'];
    await order.save();

    // Clear cart when COD order is confirmed
    if (orderStatus === 'CONFIRMED' && order.paymentMethod === 'CASH_ON_DELIVERY' && previousStatus === 'PENDING') {
      await this.clearCartItems(order.user.toString(), order.cartItemIds || []);
    }

    // Send push notification for status change
    try {
      await this.notificationService.sendOrderStatusNotification(
        order.user.toString(),
        orderId,
        orderStatus,
        order.orderNumber
      );
    } catch (error) {
      console.error('Failed to send order status notification:', error);
      // Don't throw - notification failure shouldn't fail the order update
    }

    return order;
  }

  async shipOrder(orderId: string, trackingNumber?: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    
    // Only allow shipping from CONFIRMED status
    if (order.orderStatus !== 'CONFIRMED') {
      throw new AppError('Order must be in CONFIRMED status to ship', 400);
    }

    order.orderStatus = 'OUT_FOR_DELIVERY';
    if (trackingNumber) {
      order.paymentReference = trackingNumber; // Using this field for tracking
    }
    await order.save();

    return order;
  }

  async deliverOrder(orderId: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    
    // Only allow delivery from OUT_FOR_DELIVERY status
    if (order.orderStatus !== 'OUT_FOR_DELIVERY') {
      throw new AppError('Order must be in OUT_FOR_DELIVERY status to deliver', 400);
    }

    order.orderStatus = 'COMPLETE';
    // Cash on delivery: payment stays PENDING until admin marks it paid after delivery
    await order.save();

    return order;
  }

  private validateStatusTransition(currentStatus: string, newStatus: string): void {
    const validTransitions: { [key: string]: string[] } = {
      'PENDING': ['CONFIRMED', 'CANCELLED'],
      'CONFIRMED': ['PROCESSING', 'CANCELLED'],
      'PROCESSING': ['SHIPPED', 'CANCELLED'],
      'SHIPPED': ['DELIVERED', 'CANCELLED'],
      'DELIVERED': [], // Final state
      'CANCELLED': [] // Final state
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new AppError(`Cannot transition from ${currentStatus} to ${newStatus}`, 400);
    }
  }

  async updatePaymentStatus(orderId: string, paymentStatus: string, paymentReference?: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    
    const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'];
    if (!validStatuses.includes(paymentStatus)) {
      throw new AppError('Invalid payment status', 400);
    }

    if (paymentStatus === 'COMPLETED' && order.orderStatus !== 'COMPLETE') {
      throw new AppError(
        'Order must be delivered (Complete) before payment can be recorded',
        400
      );
    }

    const previousPaymentStatus = order.paymentStatus;
    order.paymentStatus = paymentStatus as any;
    if (paymentReference) {
      order.paymentReference = paymentReference;
    }

    await order.save();

    if (order.activePayment) {
      const paymentUpdate: Record<string, unknown> = { status: paymentStatus };
      if (paymentStatus === 'COMPLETED') {
        paymentUpdate.completedAt = new Date();
      }
      await Payment.findByIdAndUpdate(order.activePayment, paymentUpdate);
    }

    // Clear cart when payment is completed for non-COD orders
    if (paymentStatus === 'COMPLETED' && order.paymentMethod !== 'CASH_ON_DELIVERY' && previousPaymentStatus !== 'COMPLETED') {
      await this.clearCartItems(order.user.toString(), order.cartItemIds || []);
    }

    if (paymentStatus === 'COMPLETED' && previousPaymentStatus !== 'COMPLETED') {
      try {
        await this.notificationService.notifyOrderStatus({
          userId: toIdString(order.user),
          orderId: toIdString(order._id),
          status: 'CONFIRMED',
          orderNumber: order.orderNumber,
        });
      } catch {
        // non-blocking
      }
    }

    return order;
  }

  /**
   * Admin records that payment was received (cash, mobile money verification, etc.).
   * Allowed only after the order has been delivered (orderStatus COMPLETE).
   */
  async recordOrderPaidByAdmin(
    orderId: string,
    adminId: string,
    payload?: { paymentReference?: string; note?: string }
  ): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);

    if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'CANCELLED_BY_BUYER') {
      throw new AppError('Cannot mark a cancelled order as paid', 400);
    }
    if (order.orderStatus !== 'COMPLETE') {
      throw new AppError(
        'Order must be delivered (Complete) before payment can be recorded',
        400
      );
    }
    if (order.paymentStatus === 'COMPLETED') {
      throw new AppError('Order is already marked as paid', 400);
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      throw new AppError('Admin not found', 404);
    }
    const adminUserId = await resolveAdminChatUserId(admin, User);

    if (payload?.paymentReference?.trim()) {
      order.paymentReference = payload.paymentReference.trim();
    }
    if (payload?.note?.trim()) {
      const line = `[Paiement enregistré par admin] ${payload.note.trim()}`;
      order.notes = order.notes ? `${order.notes}\n${line}` : line;
    }

    order.set({
      paymentMarkedPaidBy: adminUserId,
      paymentMarkedPaidAt: new Date(),
      paymentMarkedPaidByActor: 'ADMIN',
    });

    order.paymentStatus = 'COMPLETED';

    await order.save();

    if (order.activePayment) {
      await Payment.findByIdAndUpdate(order.activePayment, {
        status: 'COMPLETED',
        completedAt: new Date(),
      });
    }

    if (order.paymentMethod !== 'CASH_ON_DELIVERY') {
      await this.clearCartItems(order.user.toString(), order.cartItemIds || []);
    }

    try {
      await this.notificationService.notifyOrderStatus({
        userId: toIdString(order.user),
        orderId: toIdString(order._id),
        status: 'CONFIRMED',
        orderNumber: order.orderNumber,
      });
    } catch {
      // non-blocking
    }

    return (await Order.findById(orderId)) as IOrder;
  }

  /**
   * Buyer-initiated cancellation before seller confirmation.
   * Uses an atomic update to avoid double cancellation under concurrent requests.
   */
  async cancelOrderByBuyer(
    orderId: string,
    userId: string,
    reason?: string
  ): Promise<IOrder> {
    const trimmedReason = reason?.trim();
    const now = new Date();

    const statusUpdate: Record<string, unknown> = {
      $set: {
        orderStatus: 'CANCELLED_BY_BUYER',
        cancelledAt: now,
        cancelledBy: userId,
        cancelledByActor: 'BUYER',
        ...(trimmedReason ? { cancellationReason: trimmedReason } : {}),
      },
    };
    if (!trimmedReason) {
      statusUpdate.$unset = { cancellationReason: '' };
    }

    const order = await Order.findOneAndUpdate(
      {
        _id: orderId,
        user: userId,
        orderStatus: { $in: [...BUYER_CANCELLABLE_ORDER_STATUSES] },
      },
      statusUpdate,
      { new: true }
    ).populate('items.product');

    if (!order) {
      const existing = await Order.findById(orderId).select('user orderStatus').lean();
      if (!existing) {
        throw new AppError('Order not found', 404);
      }
      if (toIdString(existing.user) !== userId) {
        throw new AppError('Access denied', 403);
      }
      if (
        existing.orderStatus === 'CANCELLED' ||
        existing.orderStatus === 'CANCELLED_BY_BUYER'
      ) {
        throw new AppError('Order is already cancelled', 409);
      }
      throw new AppError(
        'This order can no longer be cancelled because it has already been confirmed or is being processed',
        400
      );
    }

    if (order.paymentStatus === 'PROCESSING' || order.paymentStatus === 'COMPLETED') {
      order.paymentStatus = 'REFUNDED';
    } else if (order.paymentStatus === 'PENDING') {
      order.paymentStatus = 'FAILED';
    }
    await order.save();

    if (order.activePayment) {
      await Payment.findByIdAndUpdate(order.activePayment, {
        status: order.paymentStatus === 'REFUNDED' ? 'REFUNDED' : 'FAILED',
      });
    }

    await this.restoreProductQuantities(order.items as IOrderItem[]);

    try {
      await this.notificationService.notifyOrderStatus({
        userId,
        orderId: toIdString(order._id),
        status: 'CANCELLED_BY_BUYER',
        orderNumber: order.orderNumber,
      });
      await this.notifySellersOrderCancelledByBuyer(order);
    } catch (error) {
      console.error('Failed to send buyer cancellation notifications:', error);
    }

    return order;
  }

  /** @deprecated Use cancelOrderByBuyer — kept for internal compatibility */
  async cancelOrder(orderId: string, userId: string, reason?: string): Promise<IOrder> {
    return this.cancelOrderByBuyer(orderId, userId, reason);
  }

  private async notifySellersOrderCancelledByBuyer(order: IOrder): Promise<void> {
    const orderId = toIdString(order._id);
    const orderNumber = order.orderNumber;
    const productIds = order.items.map((item) => toIdString(item.product));
    if (productIds.length === 0) return;

    const products = await Product.find({ _id: { $in: productIds } })
      .select('owner')
      .lean();
    const sellerIds = Array.from(
      new Set(products.map((p) => toIdString(p.owner)).filter(Boolean))
    );
    if (sellerIds.length === 0) return;

    const sellers = await Seller.find({ _id: { $in: sellerIds } })
      .select('user')
      .lean();
    const sellerUserIds = Array.from(
      new Set(sellers.map((s) => toIdString(s.user)).filter(Boolean))
    );

    await this.notificationService.notifyOrderCancelledByBuyerForSellers({
      sellerUserIds,
      orderId,
      orderNumber,
    });
  }

  private async restoreProductQuantities(items: IOrderItem[]): Promise<void> {
    try {
      for (const item of items) {
        const productId = toIdString(item.product);
        const product = await Product.findById(productId);

        if (!product) {
          console.warn(`Product not found for stock restore: ${productId}`);
          continue;
        }

        if (product.productType === 'simple') {
          const currentQty = product.quantityAvailable || 0;
          product.quantityAvailable = currentQty + item.quantity;
          await product.save();
          continue;
        }

        if (isVariableProductType(product.productType)) {
          let variant = null;
          if (item.variantId) {
            variant = await ProductVariant.findOne({
              _id: item.variantId,
              product: productId,
            });
          }
          if (!variant && item.sku) {
            variant = await ProductVariant.findOne({ sku: item.sku, product: productId });
          }
          if (!variant && (item.size || item.color)) {
            const q: Record<string, unknown> = { product: productId };
            if (item.size) q.size = item.size;
            if (item.color) q.color = item.color;
            variant = await ProductVariant.findOne(q);
          }

          if (!variant) {
            console.warn(`Variant not found for stock restore on product ${productId}`);
            continue;
          }

          variant.quantityAvailable = (variant.quantityAvailable || 0) + item.quantity;
          await variant.save();
        }
      }
    } catch (error) {
      console.error('Error restoring product quantities after cancellation:', error);
      throw new AppError('Order was cancelled but stock could not be restored', 500);
    }
  }

  private async calculateShippingFee(shippingAddress: IAddress): Promise<number> {
    try {
      const neighborhoodCode =
        shippingAddress.neighborhood ||
        (shippingAddress as IAddress & { state?: string }).state;

      if (!neighborhoodCode) {
        console.warn('No neighborhood on shipping address, using default fee');
        return 199.99;
      }

      return await this.shippingZoneService.calculateShippingFee(neighborhoodCode);
    } catch (error) {
      console.error('Error calculating shipping fee:', error);
      return 199.99;
    }
  }

  private async clearCartItems(userId: string, cartItemIds: string[]): Promise<void> {
    try {
      if (!cartItemIds || cartItemIds.length === 0) {
        console.log('No cart items to clear');
        return;
      }

      // Remove specific cart items by their IDs
      const result = await Cart.findOneAndUpdate(
        { user: userId },
        {
          $pull: {
            items: {
              _id: { $in: cartItemIds }
            }
          }
        },
        { new: true }
      );

      if (result) {
        // Recalculate total price based on remaining items
        const newTotal = result.items.reduce((sum, item) => {
          if (typeof item.price === 'number' && !isNaN(item.price)) {
            return sum + (item.price * item.quantity);
          }
          return sum;
        }, 0);

        result.totalPrice = newTotal;
        // Trigger pre-save middleware to recalculate total
        await result.save();
        console.log(`Cleared ${cartItemIds.length} items from cart for user ${userId}. New total: ${newTotal}`);
      } else {
        console.log(`No cart found for user ${userId}`);
      }
    } catch (error) {
      console.error('Failed to clear cart items:', error);
      // Don't throw error - cart clearing shouldn't fail the main operation
    }
  }

  private async getSellerProductIdSet(sellerId: string): Promise<Set<string>> {
    const sellerProductIds = await Product.find({ owner: sellerId }).distinct('_id');
    return new Set(sellerProductIds.map((id) => String(id)));
  }

  private mapOrderForSellerView(
    order: {
      _id?: unknown;
      orderNumber?: string;
      orderStatus?: string;
      paymentStatus?: string;
      paymentMethod?: string;
      finalPrice?: number;
      totalPrice?: number;
      items?: Array<{
        _id?: unknown;
        product?: unknown;
        quantity?: number;
        price?: number;
        sku?: string;
        size?: string;
        color?: string;
      }>;
      user?: unknown;
      createdAt?: Date;
      updatedAt?: Date;
      paymentMarkedPaidAt?: Date;
    },
    sellerId: string,
    sellerProductIds: Set<string>
  ) {
    const allItems = order.items || [];
    const sellerItems = filterOrderItemsForSeller(allItems, sellerId, sellerProductIds);
    const sellerAmount = Math.round(computeSellerItemsTotal(sellerItems) * 100) / 100;
    const orderTotal = order.finalPrice ?? order.totalPrice ?? 0;

    return {
      id: order._id != null ? String(order._id) : undefined,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      totalAmount: sellerAmount,
      sellerAmount,
      orderTotalAmount: orderTotal,
      isMultiVendor: sellerItems.length < allItems.length,
      items: mapOrderItemsForResponse(sellerItems),
      user: order.user,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      deliveredAt: order.updatedAt,
      paidAt: order.paymentMarkedPaidAt ?? order.updatedAt,
    };
  }

  async getSellerPaidOrders(
    sellerId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {}
  ): Promise<{
    orders: unknown[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    summary: { totalPaidOrders: number; totalRevenue: number };
  }> {
    const page = options.page || 1;
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const sellerProductIds = await this.getSellerProductIdSet(sellerId);
    if (sellerProductIds.size === 0) {
      return {
        orders: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        summary: { totalPaidOrders: 0, totalRevenue: 0 },
      };
    }

    const filter = await this.buildSellerOrdersFilter(sellerId, sellerProductIds, {
      status: 'COMPLETE',
      paymentStatus: 'COMPLETED',
      search: options.search,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
    });

    const [orders, total, allForRevenue] = await Promise.all([
      Order.find(filter)
        .populate('items.product', 'name images price owner sku')
        .populate('user', 'firstName lastName email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
      Order.find(filter).select('items').lean(),
    ]);

    const mapped = orders.map((order) =>
      this.mapOrderForSellerView(order, sellerId, sellerProductIds)
    );
    const totalRevenue = await this.computeSellerRevenueForOrders(
      allForRevenue,
      sellerId,
      sellerProductIds
    );

    return {
      orders: mapped,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
      summary: {
        totalPaidOrders: total,
        totalRevenue,
      },
    };
  }

  private buildSearchRegex(term: string): RegExp {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }

  private async computeSellerRevenueForOrders(
    orders: Array<{ items?: OrderItemLike[] }>,
    sellerId: string,
    sellerProductIds: Set<string>
  ): Promise<number> {
    let total = 0;
    for (const order of orders) {
      const sellerItems = filterOrderItemsForSeller(order.items || [], sellerId, sellerProductIds);
      total += computeSellerItemsTotal(sellerItems);
    }
    return Math.round(total * 100) / 100;
  }

  private async buildSellerOrdersFilter(
    sellerId: string,
    sellerProductIds: Set<string>,
    options: {
      status?: string;
      paymentStatus?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<Record<string, unknown>> {
    const productObjectIds = Array.from(sellerProductIds);
    const andClauses: Record<string, unknown>[] = [
      { 'items.product': { $in: productObjectIds } },
      excludeCancelledOrdersClause,
    ];

    if (
      options.status &&
      !HIDDEN_CANCELLED_ORDER_STATUSES.includes(
        options.status as (typeof HIDDEN_CANCELLED_ORDER_STATUSES)[number]
      )
    ) {
      andClauses.push({ orderStatus: options.status });
    }

    if (options.paymentStatus) {
      andClauses.push({ paymentStatus: options.paymentStatus });
    }

    if (options.dateFrom || options.dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (options.dateFrom) {
        dateFilter.$gte = new Date(options.dateFrom);
      }
      if (options.dateTo) {
        const end = new Date(options.dateTo);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      andClauses.push({ updatedAt: dateFilter });
    }

    const searchTerm = options.search?.trim();
    if (searchTerm) {
      const regex = this.buildSearchRegex(searchTerm);
      const orClauses: Record<string, unknown>[] = [{ orderNumber: regex }];

      const [matchingUserIds, matchingProductIds] = await Promise.all([
        User.find({
          $or: [{ email: regex }, { firstName: regex }, { lastName: regex }],
        }).distinct('_id'),
        Product.find({ owner: sellerId, name: regex }).distinct('_id'),
      ]);

      if (matchingUserIds.length > 0) {
        orClauses.push({ user: { $in: matchingUserIds } });
      }
      if (matchingProductIds.length > 0) {
        orClauses.push({ 'items.product': { $in: matchingProductIds } });
      }

      andClauses.push({ $or: orClauses });
    }

    return andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
  }

  async getSellerOrderStatusCounts(
    sellerId: string
  ): Promise<Record<string, number>> {
    const sellerProductIds = await this.getSellerProductIdSet(sellerId);
    const counts: Record<string, number> = {
      all: 0,
      PENDING: 0,
      OUT_FOR_DELIVERY: 0,
      COMPLETE: 0,
    };

    if (sellerProductIds.size === 0) {
      return counts;
    }

    const productObjectIds = Array.from(sellerProductIds);
    const rows = await Order.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          'items.product': { $in: productObjectIds },
          ...excludeCancelledOrdersClause,
        },
      },
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
    ]);

    for (const row of rows) {
      const status = row._id;
      counts.all += row.count;
      if (status in counts) {
        counts[status] = row.count;
      }
    }

    return counts;
  }

  async getSellerOrders(
    sellerId: string,
    options: { page?: number; limit?: number; status?: string; search?: string } = {}
  ): Promise<{
    orders: unknown[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    statusCounts: Record<string, number>;
  }> {
    const page = options.page || 1;
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const sellerProductIds = await this.getSellerProductIdSet(sellerId);
    if (sellerProductIds.size === 0) {
      return {
        orders: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        statusCounts: await this.getSellerOrderStatusCounts(sellerId),
      };
    }

    const filter = await this.buildSellerOrdersFilter(sellerId, sellerProductIds, {
      status: options.status,
      search: options.search,
    });

    const [orders, total, statusCounts] = await Promise.all([
      Order.find(filter)
        .populate('items.product', 'name images price owner')
        .populate('user', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
      this.getSellerOrderStatusCounts(sellerId),
    ]);

    const mapped = orders.map((order) =>
      this.mapOrderForSellerView(order, sellerId, sellerProductIds)
    );

    return {
      orders: mapped,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
      statusCounts,
    };
  }

  async getSellerOrderById(orderId: string, sellerId: string): Promise<Record<string, unknown>> {
    const sellerProductIds = await this.getSellerProductIdSet(sellerId);
    if (sellerProductIds.size === 0) {
      throw new AppError('Order not found', 404);
    }

    const productObjectIds = Array.from(sellerProductIds);
    const order = await Order.findOne({
      _id: orderId,
      'items.product': { $in: productObjectIds },
    })
      .populate('items.product', 'name images price owner')
      .populate('user', 'firstName lastName email')
      .lean();

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    return this.mapOrderForSellerView(order, sellerId, sellerProductIds);
  }

  async assertSellerOwnsOrder(orderId: string, sellerId: string): Promise<IOrder> {
    const order = await Order.findById(orderId).populate('items.product', 'owner');
    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const ownsItem = order.items.some((item) => {
      const product = item.product as { owner?: { toString(): string } | string };
      if (!product?.owner) return false;
      const ownerId =
        typeof product.owner === 'object' && product.owner !== null
          ? product.owner.toString()
          : String(product.owner);
      return ownerId === sellerId;
    });

    if (!ownsItem) {
      throw new AppError('Order not found', 404);
    }

    return order;
  }

  private applyApprovalMetadata(
    order: IOrder,
    previousStatus: string,
    nextStatus: string,
    actor?: { userId: string; role: OrderApprovalActor }
  ): void {
    if (!actor?.userId || previousStatus !== 'PENDING') return;

    if (nextStatus === 'CONFIRMED') {
      order.set({
        approvedBy: actor.userId,
        approvedAt: new Date(),
        approvedByActor: actor.role,
        rejectedBy: undefined,
        rejectedAt: undefined,
        rejectedByActor: undefined,
      });
    } else if (nextStatus === 'CANCELLED') {
      order.set({
        rejectedBy: actor.userId,
        rejectedAt: new Date(),
        rejectedByActor: actor.role,
      });
    }
  }

  private async resolveSellerUserId(sellerId: string): Promise<string> {
    const seller = await Seller.findById(sellerId).select('user').lean();
    if (!seller?.user) {
      throw new AppError('Seller account not found', 404);
    }
    return toIdString(seller.user);
  }

  async confirmOrderBySeller(orderId: string, sellerId: string): Promise<IOrder> {
    const allowed = await this.platformSettingsService.isSellerOrderApprovalAllowed();
    if (!allowed) {
      throw new AppError('Order approval not allowed.', 403);
    }

    const order = await this.assertSellerOwnsOrder(orderId, sellerId);
    if (order.orderStatus !== 'PENDING') {
      throw new AppError('Only pending orders can be accepted', 400);
    }
    const sellerUserId = await this.resolveSellerUserId(sellerId);
    return this.updateOrderStatus(orderId, 'CONFIRMED', {
      userId: sellerUserId,
      role: 'SELLER',
    });
  }

  async rejectOrderBySeller(
    orderId: string,
    sellerId: string,
    reason?: string
  ): Promise<IOrder> {
    const allowed = await this.platformSettingsService.isSellerOrderApprovalAllowed();
    if (!allowed) {
      throw new AppError('Order approval not allowed.', 403);
    }

    const order = await this.assertSellerOwnsOrder(orderId, sellerId);
    if (order.orderStatus !== 'PENDING') {
      throw new AppError('Only pending orders can be refused', 400);
    }
    if (reason?.trim()) {
      order.notes = order.notes
        ? `${order.notes}\n[Seller refusal] ${reason.trim()}`
        : `[Seller refusal] ${reason.trim()}`;
      await order.save();
    }
    const sellerUserId = await this.resolveSellerUserId(sellerId);
    return this.updateOrderStatus(orderId, 'CANCELLED', {
      userId: sellerUserId,
      role: 'SELLER',
    });
  }

  async approveOrderByAdmin(orderId: string, adminUserId: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    if (order.orderStatus !== 'PENDING') {
      throw new AppError('Only pending orders can be approved', 400);
    }
    return this.updateOrderStatus(orderId, 'CONFIRMED', {
      userId: adminUserId,
      role: 'ADMIN',
    });
  }

  async rejectOrderByAdmin(
    orderId: string,
    adminUserId: string,
    reason?: string
  ): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    if (order.orderStatus !== 'PENDING') {
      throw new AppError('Only pending orders can be rejected', 400);
    }
    if (reason?.trim()) {
      order.notes = order.notes
        ? `${order.notes}\n[Admin rejection] ${reason.trim()}`
        : `[Admin rejection] ${reason.trim()}`;
      await order.save();
    }
    return this.updateOrderStatus(orderId, 'CANCELLED', {
      userId: adminUserId,
      role: 'ADMIN',
    });
  }

  private async decrementProductQuantities(cartItems: any[]): Promise<void> {
    try {
      for (const item of cartItems) {
        const productId = typeof item.product === 'object' ? item.product._id : item.product;
        const product = await Product.findById(productId);

        if (!product) {
          console.warn(`Product not found: ${productId}`);
          continue;
        }

        if (product.productType === 'simple') {
          // Decrement quantity for simple products
          const currentQty = product.quantityAvailable || 0;
          const newQty = Math.max(0, currentQty - item.quantity);

          product.quantityAvailable = newQty;
          await product.save();

          console.log(`Decremented product ${productId} quantity from ${currentQty} to ${newQty}`);

          // Warn if stock is low or out
          if (newQty === 0) {
            console.warn(`Product ${productId} is now out of stock`);
          } else if (newQty < 5) {
            console.warn(`Product ${productId} is low on stock: ${newQty} remaining`);
          }
        } else if (isVariableProductType(product.productType)) {
          let variant = null;
          if (item.variantId) {
            variant = await ProductVariant.findOne({
              _id: item.variantId,
              product: productId,
            });
          }
          if (!variant && item.sku) {
            variant = await ProductVariant.findOne({ sku: item.sku, product: productId });
          }
          if (!variant && (item.size || item.color)) {
            const q: Record<string, unknown> = { product: productId };
            if (item.size) q.size = item.size;
            if (item.color) q.color = item.color;
            variant = await ProductVariant.findOne(q);
          }

          if (!variant) {
            console.warn(`Variant not found for order item on product ${productId}`);
            continue;
          }

          const currentQty = variant.quantityAvailable;
          const newQty = Math.max(0, currentQty - item.quantity);

          variant.quantityAvailable = newQty;
          await variant.save();

          console.log(`Decremented variant ${item.sku} quantity from ${currentQty} to ${newQty}`);

          // Warn if stock is low or out
          if (newQty === 0) {
            console.warn(`Variant ${item.sku} is now out of stock`);
          } else if (newQty < 5) {
            console.warn(`Variant ${item.sku} is low on stock: ${newQty} remaining`);
          }
        }
      }
    } catch (error) {
      console.error('Error decrementing product quantities:', error);
      // Log error but don't throw - order is already created
      // We might want to implement a compensating transaction or alert system here
    }
  }
}