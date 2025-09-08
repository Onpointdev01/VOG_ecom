import { injectable, inject } from 'inversify';
import { BaseService } from './BaseService';
import { Order, IOrder } from '../models/Order';
import { Cart } from '../models/Cart';
import { Address } from '../models/Address';
import { PaymentOption, PaymentMethodType } from '../models/PaymentOption';
import { PaymentService } from './PaymentService';
import { PaymentMethod } from '../models/Payment';
import AppError from '../utils/errors/AppError';
import TYPES from '../di';
// [SSE] realtime engine
import { streamController } from '../realtime/StreamController';

export interface CreateOrderRequest {
  userId: string;
  paymentMethod: PaymentMethodType;
  shippingAddressId: string;
  selectedItems?: string[];
  notes?: string;
}

@injectable()
export class OrderService extends BaseService {
  constructor(@inject(TYPES.PaymentService) private paymentService: PaymentService) {
    super();
  }

  async createOrder(data: CreateOrderRequest): Promise<IOrder> {
    const { userId, paymentMethod, shippingAddressId, selectedItems, notes } = data;

    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) throw new AppError('Cart is empty', 400);

    let itemsToOrder = cart.items;
    if (selectedItems?.length) {
      itemsToOrder = cart.items.filter(item => selectedItems.includes(item._id.toString()));
      if (!itemsToOrder.length) throw new AppError('No valid items selected for checkout', 400);
    }

    const paymentOption = await PaymentOption.findOne({ code: paymentMethod, isEnabled: true });
    if (!paymentOption) throw new AppError('Payment method not available', 400);

    const shippingAddress = await Address.findOne({ _id: shippingAddressId, user: userId });
    if (!shippingAddress) throw new AppError('Shipping address not found', 404);

    const totalPrice = itemsToOrder.reduce((sum, item) => {
      let itemPrice = item.price;
      if (typeof itemPrice !== 'number' || isNaN(itemPrice) || itemPrice < 0) {
        const product = item.product as any;
        if (product && typeof product.price === 'number') itemPrice = product.price;
        else throw new AppError(`Invalid price for item: ${product?.name || 'Unknown product'}.`, 400);
      }
      return sum + (itemPrice * item.quantity);
    }, 0);

    if (isNaN(totalPrice) || totalPrice < 0) throw new AppError('Unable to calculate order total.', 400);

    const shippingFee = this.calculateShippingFee(paymentMethod, totalPrice);
    const finalPrice = totalPrice + shippingFee;

    const cartItemIdsToRemove = selectedItems?.length
      ? selectedItems
      : cart.items.map(item => item._id.toString());

    // order number
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const orderNumber = `ORD-${timestamp}-${random}`;

    const order = new Order({
      user: userId,
      items: itemsToOrder.map(item => {
        let itemPrice = item.price;
        if (typeof itemPrice !== 'number' || isNaN(itemPrice) || itemPrice < 0) {
          const product = item.product as any;
          if (product && typeof product.price === 'number') itemPrice = product.price;
          else throw new AppError(`Cannot create order: Invalid price for item ${product?.name || 'Unknown product'}`, 400);
        }
        return {
          product: item.product,
          quantity: item.quantity,
          sku: item.sku,
          size: item.size,
          color: item.color,
          price: itemPrice,
          bidId: item.bidId,
        };
      }),
      shippingAddress: {
        fullName: shippingAddress.fullName,
        phoneNumber: shippingAddress.phoneNumber,
        homeAddress: shippingAddress.homeAddress,
        state: shippingAddress.state,
        city: shippingAddress.city,
        postalCode: shippingAddress.postalCode,
        country: shippingAddress.country,
      },
      paymentMethod,
      totalPrice,
      shippingFee,
      finalPrice,
      orderNumber,
      notes,
      cartItemIds: cartItemIdsToRemove,
      paymentStatus: paymentMethod === 'CASH_ON_DELIVERY' ? 'PENDING' : 'PENDING',
      orderStatus: 'PENDING',
    });

    await order.save();

    // [SSE] order created
    try {
      streamController.publishToUser(userId, 'order:update', {
        orderId: order.id,
        status: order.orderStatus,
        total: order.finalPrice,
        createdAt: order.createdAt,
      });
    } catch {}

    // create initial payment record
    try {
      const payment = await this.paymentService.createPayment({
        orderId: (order._id as string).toString(),
        userId: userId,
        paymentMethod: paymentMethod as PaymentMethod,
        amount: finalPrice,
        phoneNumber: undefined,
        description: `Payment for order ${orderNumber}`,
        currency: 'XAF'
      });

      order.activePayment = payment._id as any;
      order.payments = [payment._id as any];
      await order.save();

      // [SSE] payment record created (lightweight update)
      try {
        streamController.publishToUser(userId, 'order:update', {
          orderId: order.id,
          status: order.orderStatus,
          paymentStatus: order.paymentStatus,
          createdAt: new Date().toISOString(),
        });
      } catch {}
    } catch (e) {
      console.error('Payment creation error:', e);
      // non-fatal for order creation
    }

    return order;
  }

  async getOrderById(orderId: string): Promise<IOrder> {
    return this.verifyDoc(orderId, Order, 'items.product');
  }

  async getUserOrders(userId: string, options?: { limit?: number; status?: string; page?: number }): Promise<IOrder[]> {
    const filter: any = { user: userId };
    if (options?.status) {
      if (options.status === 'recent') {
        const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        filter.createdAt = { $gte: thirtyDaysAgo };
      } else {
        filter.orderStatus = options.status;
      }
    }

    let query = Order.find(filter).populate('items.product').sort({ createdAt: -1 });
    if (options?.page && options?.limit) {
      const skip = (options.page - 1) * (options.limit);
      query = query.skip(skip);
    }
    if (options?.limit) query = query.limit(options.limit);
    return query.exec();
  }

  async getAllOrders(filter: any = {}, options: { page: number; limit: number }) {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    const orders = await Order.find(filter)
      .populate('items.product')
      .populate('user', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    return { orders, total, page, totalPages };
  }

  async updateOrderStatus(orderId: string, orderStatus: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    const validStatuses = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(orderStatus)) throw new AppError('Invalid order status', 400);

    this.validateStatusTransition(order.orderStatus, orderStatus);

    const previousStatus = order.orderStatus;
    order.orderStatus = orderStatus as any;
    await order.save();

    if (orderStatus === 'CONFIRMED' && order.paymentMethod === 'CASH_ON_DELIVERY' && previousStatus === 'PENDING') {
      await this.clearCartItems(order.user.toString(), order.cartItemIds || []);
    }

    // [SSE]
    try {
      streamController.publishToUser(order.user.toString(), 'order:update', {
        orderId: order.id,
        status: order.orderStatus,
        createdAt: new Date().toISOString(),
      });
    } catch {}

    return order;
  }

  async shipOrder(orderId: string, trackingNumber?: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    if (order.orderStatus !== 'CONFIRMED') throw new AppError('Order must be in CONFIRMED status to ship', 400);

    order.orderStatus = 'OUT_FOR_DELIVERY';
    if (trackingNumber) order.paymentReference = trackingNumber;
    await order.save();

    // [SSE]
    try {
      streamController.publishToUser(order.user.toString(), 'order:update', {
        orderId: order.id,
        status: 'OUT_FOR_DELIVERY',
        trackingNumber,
        createdAt: new Date().toISOString(),
      });
    } catch {}

    return order;
  }

  async deliverOrder(orderId: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    if (order.orderStatus !== 'OUT_FOR_DELIVERY') throw new AppError('Order must be in OUT_FOR_DELIVERY status to deliver', 400);

    order.orderStatus = 'COMPLETE';
    if (order.paymentMethod === 'CASH_ON_DELIVERY') {
      order.paymentStatus = 'COMPLETED';
    }
    await order.save();

    // [SSE]
    try {
      streamController.publishToUser(order.user.toString(), 'order:update', {
        orderId: order.id,
        status: 'COMPLETE',
        paymentStatus: order.paymentStatus,
        createdAt: new Date().toISOString(),
      });
    } catch {}

    return order;
  }

  private validateStatusTransition(currentStatus: string, newStatus: string): void {
    const validTransitions: Record<string, string[]> = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PROCESSING', 'CANCELLED'],
      PROCESSING: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['DELIVERED', 'CANCELLED'],
      DELIVERED: [],
      CANCELLED: [],
    };
    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new AppError(`Cannot transition from ${currentStatus} to ${newStatus}`, 400);
    }
  }

  async updatePaymentStatus(orderId: string, paymentStatus: string, paymentReference?: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];
    if (!validStatuses.includes(paymentStatus)) throw new AppError('Invalid payment status', 400);

    const previousPaymentStatus = order.paymentStatus;
    order.paymentStatus = paymentStatus as any;
    if (paymentReference) order.paymentReference = paymentReference;

    if (paymentStatus === 'COMPLETED' && order.paymentMethod !== 'CASH_ON_DELIVERY') {
      order.orderStatus = 'CONFIRMED';
    }

    await order.save();

    if (paymentStatus === 'COMPLETED' && order.paymentMethod !== 'CASH_ON_DELIVERY' && previousPaymentStatus !== 'COMPLETED') {
      await this.clearCartItems(order.user.toString(), order.cartItemIds || []);
    }

    // [SSE]
    try {
      streamController.publishToUser(order.user.toString(), 'order:update', {
        orderId: order.id,
        status: order.orderStatus,
        paymentStatus: order.paymentStatus,
        createdAt: new Date().toISOString(),
      });
    } catch {}

    return order;
  }

  async cancelOrder(orderId: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    if (['SHIPPED', 'DELIVERED'].includes(order.orderStatus)) {
      throw new AppError('Cannot cancel order that has been shipped or delivered', 400);
    }

    order.orderStatus = 'CANCELLED';
    await order.save();

    // [SSE]
    try {
      streamController.publishToUser(order.user.toString(), 'order:update', {
        orderId: order.id,
        status: 'CANCELLED',
        createdAt: new Date().toISOString(),
      });
    } catch {}

    return order;
  }

  private calculateShippingFee(paymentMethod: PaymentMethodType, totalPrice: number): number {
    if (paymentMethod === 'CASH_ON_DELIVERY') return 5.0;
    if (totalPrice >= 100) return 0;
    return 10.0;
  }

  private async clearCartItems(userId: string, cartItemIds: string[]): Promise<void> {
    try {
      if (!cartItemIds?.length) return;

      const result = await Cart.findOneAndUpdate(
        { user: userId },
        { $pull: { items: { _id: { $in: cartItemIds } } } },
        { new: true }
      );
      if (result) await result.save();
    } catch (error) {
      console.error('Failed to clear cart items:', error);
    }
  }
}
