import { injectable, inject } from 'inversify';
import { BaseService } from './BaseService';
import { Order, IOrder } from '../models/Order';
import { Cart, ICart } from '../models/Cart';
import { Address, IAddress } from '../models/Address';
import { PaymentOption, PaymentMethodType } from '../models/PaymentOption';
import { PaymentService } from './PaymentService';
import { PaymentMethod } from '../models/Payment';
import AppError from '../utils/errors/AppError';
import { TYPES } from '../di';

export interface CreateOrderRequest {
  userId: string;
  paymentMethod: PaymentMethodType;
  shippingAddressId: string;
  selectedItems?: string[];
  notes?: string;
}

@injectable()
export class OrderService extends BaseService {
  constructor(
    @inject(TYPES.PaymentService) private paymentService: PaymentService
  ) {
    super();
  }
  async createOrder(data: CreateOrderRequest): Promise<IOrder> {
    const { userId, paymentMethod, shippingAddressId, selectedItems, notes } = data;

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

    // Validate and calculate totals based on selected items
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
    
    const shippingFee = this.calculateShippingFee(paymentMethod, totalPrice);
    const finalPrice = totalPrice + shippingFee;

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

    try {
      await order.save();
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
    // Cart will be cleared when:
    // 1. COD orders are CONFIRMED by seller
    // 2. Other payment orders are paid (COMPLETED payment status)
    
    return order;
  }

  async getOrderById(orderId: string): Promise<IOrder> {
    // Don't populate user for ownership checks - populate only items.product
    return this.verifyDoc(orderId, Order, 'items.product');
  }

  async getUserOrders(userId: string, options?: { limit?: number; status?: string; page?: number }): Promise<IOrder[]> {
    const filter: any = { user: userId };

    // Handle status filtering
    if (options?.status) {
      if (options.status === 'recent') {
        // For recent orders, get orders from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        filter.createdAt = { $gte: thirtyDaysAgo };
      } else {
        // Filter by specific order status
        filter.orderStatus = options.status;
      }
    }

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
    
    const orders = await Order.find(filter)
      .populate('items.product')
      .populate('user', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Order.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    
    return {
      orders,
      total,
      page,
      totalPages,
    };
  }

  async updateOrderStatus(orderId: string, orderStatus: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    
    const validStatuses = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(orderStatus)) {
      throw new AppError('Invalid order status', 400);
    }

    // Validate status transitions
    this.validateStatusTransition(order.orderStatus, orderStatus);

    const previousStatus = order.orderStatus;
    order.orderStatus = orderStatus as any;
    await order.save();

    // Clear cart when COD order is confirmed
    if (orderStatus === 'CONFIRMED' && order.paymentMethod === 'CASH_ON_DELIVERY' && previousStatus === 'PENDING') {
      await this.clearCartItems(order.user.toString(), order.cartItemIds || []);
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
    
    // For COD orders, mark payment as completed upon delivery
    if (order.paymentMethod === 'CASH_ON_DELIVERY') {
      order.paymentStatus = 'COMPLETED';
    }
    
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
    
    const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];
    if (!validStatuses.includes(paymentStatus)) {
      throw new AppError('Invalid payment status', 400);
    }

    const previousPaymentStatus = order.paymentStatus;
    order.paymentStatus = paymentStatus as any;
    if (paymentReference) {
      order.paymentReference = paymentReference;
    }

    // Auto-confirm order if payment is completed (except for cash on delivery)
    if (paymentStatus === 'COMPLETED' && order.paymentMethod !== 'CASH_ON_DELIVERY') {
      order.orderStatus = 'CONFIRMED';
    }

    await order.save();

    // Clear cart when payment is completed for non-COD orders
    if (paymentStatus === 'COMPLETED' && order.paymentMethod !== 'CASH_ON_DELIVERY' && previousPaymentStatus !== 'COMPLETED') {
      await this.clearCartItems(order.user.toString(), order.cartItemIds || []);
    }

    return order;
  }

  async cancelOrder(orderId: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    
    // Only allow cancellation if order is not yet shipped
    if (['SHIPPED', 'DELIVERED'].includes(order.orderStatus)) {
      throw new AppError('Cannot cancel order that has been shipped or delivered', 400);
    }

    order.orderStatus = 'CANCELLED';
    await order.save();

    return order;
  }

  private calculateShippingFee(paymentMethod: PaymentMethodType, totalPrice: number): number {
    // For cash on delivery, add a small handling fee
    if (paymentMethod === 'CASH_ON_DELIVERY') {
      return 5.00; // Fixed COD fee
    }
    
    // Free shipping for orders above certain amount
    if (totalPrice >= 100) {
      return 0;
    }
    
    // Standard shipping fee
    return 10.00;
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
        // Trigger pre-save middleware to recalculate total
        await result.save();
        console.log(`Cleared ${cartItemIds.length} items from cart for user ${userId}`);
      } else {
        console.log(`No cart found for user ${userId}`);
      }
    } catch (error) {
      console.error('Failed to clear cart items:', error);
      // Don't throw error - cart clearing shouldn't fail the main operation
    }
  }
}