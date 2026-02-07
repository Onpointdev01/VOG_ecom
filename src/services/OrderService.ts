import { injectable, inject } from 'inversify';
import { BaseService } from './BaseService';
import { Order, IOrder } from '../models/Order';
import { Cart, ICart } from '../models/Cart';
import { Product } from '../models/Product';
import { ProductVariant } from '../models/ProductVariant';
import { Address, IAddress } from '../models/Address';
import { PaymentOption, PaymentMethodType } from '../models/PaymentOption';
import { PaymentService } from './PaymentService';
import { IShippingZoneService } from './ShippingZoneService';
import { NotificationService } from './NotificationService';
import { IPayoutService } from './PayoutService';
import { PaymentMethod } from '../models/Payment';
import AppError from '../utils/errors/AppError';
import { TYPES } from '../di';
import { Model } from 'mongoose';
import { IUser } from '../models';

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
    @inject(TYPES.PaymentService) private paymentService: PaymentService,
    @inject(TYPES.ShippingZoneService) private shippingZoneService: IShippingZoneService,
    @inject(TYPES.NotificationService) private notificationService: NotificationService,
    @inject(TYPES.PayoutService) private payoutService: IPayoutService,
    @inject(TYPES.User) private User: Model<IUser>
  ) {
    super();
  }
  async createOrder(data: CreateOrderRequest): Promise<IOrder> {
    try {
      const { userId, paymentMethod, shippingAddressId, selectedItems, notes } = data;

      console.log('Creating order for userId:', userId);
      console.log('Order data:', { paymentMethod, shippingAddressId, selectedItems, notes });

      // Verify user's cart exists and has items
      const cart = await Cart.findOne({ user: userId }).populate({
        path: 'items.product',
        select: 'name price images productType quantityAvailable'
      });
      
      if (!cart) {
        console.error('Cart not found for userId:', userId);
        throw new AppError('Cart is empty', 400);
      }
      
      if (!cart.items || cart.items.length === 0) {
        console.error('Cart has no items for userId:', userId);
        throw new AppError('Cart is empty', 400);
      }
      
      console.log('Cart found with', cart.items.length, 'items');

      // Filter items based on selection (partial checkout)
      let itemsToOrder = cart.items;
      if (selectedItems && selectedItems.length > 0) {
        itemsToOrder = cart.items.filter(item => {
          if (!item || !item._id) {
            console.error('Invalid cart item found:', item);
            return false;
          }
          const itemId = item._id.toString();
          return selectedItems.includes(itemId);
        });
        
        if (itemsToOrder.length === 0) {
          const validItemIds = cart.items
            .filter(i => i && i._id)
            .map(i => i._id.toString());
          console.error('No valid items selected. SelectedItems:', selectedItems, 'Cart item IDs:', validItemIds);
          throw new AppError('No valid items selected for checkout', 400);
        }
      }
      
      console.log('Items to order:', itemsToOrder.length);

      // Verify payment method exists and is enabled
      const paymentOption = await PaymentOption.findOne({ 
        code: paymentMethod, 
        isEnabled: true 
      });
      if (!paymentOption) {
        console.error('Payment method not found or disabled:', paymentMethod);
        throw new AppError('Payment method not available', 400);
      }
      
      console.log('Payment method verified:', paymentMethod);

      // Verify shipping address exists and belongs to user
      const shippingAddress = await Address.findOne({ 
        _id: shippingAddressId, 
        user: userId 
      });
      if (!shippingAddress) {
        console.error('Shipping address not found:', shippingAddressId, 'for userId:', userId);
        throw new AppError('Shipping address not found', 404);
      }
      
      console.log('Shipping address verified:', shippingAddressId);

      // Validate and calculate totals based on selected items
      const totalPrice = itemsToOrder.reduce((sum, item) => {
        let itemPrice = item.price;
        
        // If cart item doesn't have price, get it from the populated product
        if (typeof itemPrice !== 'number' || isNaN(itemPrice) || itemPrice < 0) {
          const product = item.product as any;
          if (product && typeof product.price === 'number') {
            itemPrice = product.price;
          } else {
            console.error('Invalid price for item:', item, 'Product:', product);
            throw new AppError(`Invalid price for item: ${product?.name || 'Unknown product'}. Please refresh your cart and try again.`, 400);
          }
        }
        
        return sum + (itemPrice * item.quantity);
      }, 0);
      
      if (isNaN(totalPrice) || totalPrice < 0) {
        console.error('Invalid total price calculated:', totalPrice);
        throw new AppError('Unable to calculate order total. Please check your cart items and try again.', 400);
      }
      
      console.log('Total price calculated:', totalPrice);

      // Calculate shipping fee based on province
      const shippingFee = await this.calculateShippingFee(shippingAddress);
      const finalPrice = totalPrice + shippingFee;
      
      console.log('Shipping fee:', shippingFee, 'Final price:', finalPrice);

    // Store cart item IDs for later clearing
    const cartItemIdsToRemove = selectedItems && selectedItems.length > 0 
      ? selectedItems 
      : cart.items
          .filter(item => item && item._id)
          .map(item => item._id.toString());

      // Generate order number
      const timestamp = Date.now().toString();
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const orderNumber = `ORD-${timestamp}-${random}`;
      
      console.log('Generated order number:', orderNumber);

      // Create order
      const order = new Order({
      user: userId,
      items: itemsToOrder.map((item, index) => {
        // Validate item structure
        if (!item) {
          console.error(`Invalid item at index ${index}:`, item);
          throw new AppError(`Invalid cart item at position ${index + 1}. Please refresh your cart and try again.`, 400);
        }

        if (!item.product) {
          console.error(`Item at index ${index} has no product:`, item);
          throw new AppError(`Cart item at position ${index + 1} is missing product information. Please refresh your cart and try again.`, 400);
        }

        // Get product ID (handle both populated and non-populated cases)
        const product = item.product as any;
        const productId = (product && typeof product === 'object' && product._id) 
          ? product._id 
          : item.product;

        if (!productId) {
          console.error(`Item at index ${index} has invalid product ID:`, item);
          throw new AppError(`Cart item at position ${index + 1} has invalid product. Please refresh your cart and try again.`, 400);
        }

        let itemPrice = item.price;
        
        // Ensure we have a valid price for the order item
        if (typeof itemPrice !== 'number' || isNaN(itemPrice) || itemPrice < 0) {
          const product = item.product as any;
          if (product && typeof product.price === 'number') {
            itemPrice = product.price;
          } else {
            const productName = product?.name || 'Unknown product';
            console.error(`Invalid price for item at index ${index}:`, { item, product, itemPrice });
            throw new AppError(`Cannot create order: Invalid price for item "${productName}". Please refresh your cart and try again.`, 400);
          }
        }
        
        return {
          product: productId,
          quantity: item.quantity || 1,
          sku: item.sku || undefined,
          size: item.size || undefined,
          color: item.color || undefined,
          price: itemPrice,
          bidId: item.bidId || undefined,
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
    // Cart will be cleared when:
    // 1. COD orders are CONFIRMED by seller
    // 2. Other payment orders are paid (COMPLETED payment status)

    // Notify client of new order
    try {
      await this.notificationService.sendNewOrderNotificationToClient(
        userId,
        (order._id as string).toString(),
        orderNumber,
        finalPrice
      );
    } catch (error) {
      console.error('Failed to send new order notification to client:', error);
      // Don't throw - notification failure shouldn't fail the order creation
    }

    // Notify admins of new order
    try {
      const user = await this.User.findById(userId);
      const customerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Customer';
      
      await this.notificationService.sendNewOrderNotificationToAdmins(
        (order._id as string).toString(),
        orderNumber,
        customerName,
        finalPrice,
        paymentMethod
      );
    } catch (error) {
      console.error('Failed to send new order notification to admins:', error);
      // Don't throw - notification failure shouldn't fail the order creation
    }

    // Notify sellers of new order (for products they own)
    try {
      const user = await this.User.findById(userId);
      const customerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Customer';
      
      // Group items by seller
      const sellerItems = new Map<string, { sellerId: string; items: any[]; productNames: string[] }>();
      
      for (const item of order.items) {
        const product = item.product as any;
        if (product && product.owner) {
          const ownerId = product.owner._id || product.owner;
          const ownerIdStr = ownerId.toString();
          
          if (!sellerItems.has(ownerIdStr)) {
            sellerItems.set(ownerIdStr, {
              sellerId: ownerIdStr,
              items: [],
              productNames: []
            });
          }
          
          const sellerData = sellerItems.get(ownerIdStr)!;
          sellerData.items.push(item);
          sellerData.productNames.push(product.name || 'Product');
        }
      }

      // Send notification to each seller
      for (const [sellerId, data] of Array.from(sellerItems.entries())) {
        const sellerTotal = data.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
        await this.notificationService.sendNewOrderNotificationToSeller(
          sellerId,
          (order._id as string).toString(),
          orderNumber,
          customerName,
          sellerTotal,
          data.productNames
        );
      }
    } catch (error) {
      console.error('Failed to send new order notification to sellers:', error);
      // Don't throw - notification failure shouldn't fail the order creation
    }
    
      console.log('Order created successfully:', order._id);
      return order;
    } catch (error: any) {
      console.error('Error in createOrder service:', error);
      console.error('Error stack:', error.stack);
      console.error('Error name:', error.name);
      
      // Re-throw AppError as-is
      if (error instanceof AppError) {
        throw error;
      }
      
      // Wrap unexpected errors with more context
      throw new AppError(
        `Failed to create order: ${error.message || 'Unknown error'}`,
        error.statusCode || 500
      );
    }
  }

  async getOrderById(orderId: string): Promise<IOrder> {
    // Don't populate user for ownership checks - populate only items.product
    return this.verifyDoc(orderId, Order, 'items.product');
  }

  async getUserOrders(userId: string, options?: { limit?: number; status?: string; page?: number }): Promise<IOrder[]> {
    try {
      console.log('getUserOrders called with userId:', userId, 'options:', options);
      
      // Validate userId is a valid ObjectId
      if (!userId || typeof userId !== 'string') {
        throw new AppError('Invalid user ID', 400);
      }
      
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

      console.log('Order filter:', JSON.stringify(filter, null, 2));

      let query = Order.find(filter)
        .populate({
          path: 'items.product',
          select: 'name price images sizes color'
        })
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

      console.log('Executing query...');
      const orders = await query.lean().exec();
      console.log('Query executed successfully, found', orders?.length || 0, 'orders');
      
      // Clean up any null products (deleted products)
      const cleanedOrders = (orders || []).map((order: any) => {
        if (order.items && Array.isArray(order.items)) {
          order.items = order.items.map((item: any) => {
            // If product was deleted (null), provide a placeholder
            if (!item.product) {
              item.product = {
                name: 'Product no longer available',
                price: item.price || 0,
                images: [],
                _id: null
              };
            }
            return item;
          });
        }
        return order;
      });
      
      console.log('Returning cleaned orders');
      return cleanedOrders as IOrder[];
    } catch (error) {
      console.error('Error in getUserOrders service:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      throw new AppError(`Failed to retrieve orders: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
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

  async updateOrderStatus(
    orderId: string, 
    orderStatus: string, 
    performedBy?: { adminId?: string; sellerId?: string }
  ): Promise<IOrder> {
    console.log(`🔄 Updating order ${orderId} status to: ${orderStatus}`);
    const order = await this.verifyDoc(orderId, Order);

    const previousStatus = order.orderStatus;
    order.orderStatus = orderStatus as any;
    
    // Update payment status to COMPLETED when order status becomes COMPLETE
    if (orderStatus === 'COMPLETE' && previousStatus !== 'COMPLETE') {
      if (order.paymentStatus !== 'COMPLETED') {
        console.log(`💰 Updating payment status to COMPLETED for order ${orderId}`);
        order.paymentStatus = 'COMPLETED';
      }
    }
    
    await order.save();

    // Clear cart when COD order is confirmed
    if (orderStatus === 'CONFIRMED' && order.paymentMethod === 'CASH_ON_DELIVERY' && previousStatus === 'PENDING') {
      let userId: string | undefined;
      if (order.user) {
        if (typeof order.user === 'object' && '_id' in order.user) {
          userId = (order.user as any)._id?.toString() || (order.user as any).id?.toString();
        } else {
          userId = order.user.toString();
        }
      }
      if (userId) {
        await this.clearCartItems(userId, order.cartItemIds || []);
      }
    }

    // Send push notification for status change to customer
    try {
      let userId: string | undefined;
      if (order.user) {
        if (typeof order.user === 'object' && '_id' in order.user) {
          userId = (order.user as any)._id?.toString() || (order.user as any).id?.toString();
        } else {
          userId = order.user.toString();
        }
      }
      if (userId) {
        console.log(`📧 Calling sendOrderStatusNotification for user ${userId}, order ${orderId}, status ${orderStatus}`);
        await this.notificationService.sendOrderStatusNotification(
          userId,
          orderId,
          orderStatus,
          order.orderNumber
        );
      } else {
        console.warn(`⚠️ Order ${orderId} has no user, skipping notification`);
      }
      console.log(`✅ Order status notification completed for order ${orderId}`);
    } catch (error) {
      console.error('❌ Failed to send order status notification:', error);
      console.error('Error details:', error);
      // Don't throw - notification failure shouldn't fail the order update
    }

    // Notify admins of order status change (excluding the admin who performed the action)
    try {
      const user = await this.User.findById(order.user);
      const customerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Customer';
      
      await this.notificationService.sendOrderStatusChangeNotificationToAdmins(
        orderId,
        order.orderNumber || orderId.substring(0, 8),
        previousStatus,
        orderStatus,
        customerName,
        performedBy?.adminId // Exclude the admin who performed the action
      );
    } catch (error) {
      console.error('Failed to send order status change notification to admins:', error);
      // Don't throw - notification failure shouldn't fail the order update
    }

    // Notify sellers of order status change (for products they own)
    try {
      const user = await this.User.findById(order.user);
      const customerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Customer';
      
      // Get unique seller IDs from order items
      const sellerIds = new Set<string>();
      const sellerAmounts = new Map<string, number>();
      
      for (const item of order.items) {
        const product = item.product as any;
        if (product && product.owner) {
          const ownerId = product.owner._id || product.owner;
          const ownerIdStr = ownerId.toString();
          sellerIds.add(ownerIdStr);
          
          // Calculate amount for this seller
          const itemAmount = (item.price || 0) * (item.quantity || 0);
          sellerAmounts.set(ownerIdStr, (sellerAmounts.get(ownerIdStr) || 0) + itemAmount);
        }
      }

      // If order status is COMPLETE, create payouts and send completion notifications
      if (orderStatus === 'COMPLETE' && previousStatus !== 'COMPLETE') {
        try {
          // Create payouts for all sellers
          await this.payoutService.createPayoutForOrder(orderId);
          
          // Send completion notification to each seller with their payout amount
          for (const sellerId of Array.from(sellerIds)) {
            const amount = sellerAmounts.get(sellerId) || 0;
            await this.notificationService.sendOrderCompleteNotificationToSeller(
              sellerId,
              orderId,
              order.orderNumber || orderId.substring(0, 8),
              amount,
              customerName
            );
          }
        } catch (error) {
          console.error('Failed to create payouts or send completion notifications:', error);
          // Don't throw - payout/notification failure shouldn't fail the order update
        }
      } else {
        // For other status changes, send regular status change notification
        for (const sellerId of Array.from(sellerIds)) {
          await this.notificationService.sendOrderStatusChangeNotificationToSeller(
            sellerId,
            orderId,
            order.orderNumber || orderId.substring(0, 8),
            previousStatus,
            orderStatus,
            customerName,
            performedBy?.sellerId // Exclude the seller who performed the action
          );
        }
      }
    } catch (error) {
      console.error('Failed to send order status change notification to sellers:', error);
      // Don't throw - notification failure shouldn't fail the order update
    }

    return order;
  }

  async shipOrder(
    orderId: string, 
    trackingNumber?: string,
    performedBy?: { adminId?: string; sellerId?: string }
  ): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    
    // Only allow shipping from CONFIRMED status
    if (order.orderStatus !== 'CONFIRMED') {
      throw new AppError('Order must be in CONFIRMED status to ship', 400);
    }

    // Use updateOrderStatus to handle notifications properly
    const previousStatus = order.orderStatus;
    order.orderStatus = 'OUT_FOR_DELIVERY';
    if (trackingNumber) {
      order.paymentReference = trackingNumber; // Using this field for tracking
    }
    await order.save();

    // Send notifications (excluding the performer)
    try {
      const user = await this.User.findById(order.user);
      const customerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Customer';
      
      // Notify admins
      await this.notificationService.sendOrderStatusChangeNotificationToAdmins(
        orderId,
        order.orderNumber || orderId.substring(0, 8),
        previousStatus,
        'OUT_FOR_DELIVERY',
        customerName,
        performedBy?.adminId
      );

      // Notify sellers
      const sellerIds = new Set<string>();
      for (const item of order.items) {
        const product = item.product as any;
        if (product && product.owner) {
          const ownerId = product.owner._id || product.owner;
          sellerIds.add(ownerId.toString());
        }
      }
      for (const sellerId of Array.from(sellerIds)) {
        await this.notificationService.sendOrderStatusChangeNotificationToSeller(
          sellerId,
          orderId,
          order.orderNumber || orderId.substring(0, 8),
          previousStatus,
          'OUT_FOR_DELIVERY',
          customerName,
          performedBy?.sellerId
        );
      }
    } catch (error) {
      console.error('Failed to send notifications for ship order:', error);
    }

    return order;
  }

  async deliverOrder(
    orderId: string, 
    performedBy?: { adminId?: string; sellerId?: string }
  ): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    
    // Only allow delivery from OUT_FOR_DELIVERY status
    if (order.orderStatus !== 'OUT_FOR_DELIVERY') {
      throw new AppError('Order must be in OUT_FOR_DELIVERY status to deliver', 400);
    }

    // Use updateOrderStatus to handle all notifications, payouts, and payment status updates
    // This ensures consistency and triggers all necessary notifications
    // Payment status will be automatically set to COMPLETED in updateOrderStatus when order becomes COMPLETE
    return this.updateOrderStatus(orderId, 'COMPLETE', performedBy);
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

  /**
   * Fix existing COMPLETE orders that don't have paymentStatus set to COMPLETED
   * This is a utility method to fix data consistency for existing orders
   */
  async fixCompleteOrdersPaymentStatus(): Promise<{ updated: number }> {
    try {
      const result = await Order.updateMany(
        {
          orderStatus: 'COMPLETE',
          $or: [
            { paymentStatus: { $ne: 'COMPLETED' } },
            { paymentStatus: { $exists: false } }
          ]
        },
        {
          $set: { paymentStatus: 'COMPLETED' }
        }
      );

      console.log(`✅ Fixed ${result.modifiedCount} COMPLETE orders with payment status`);
      return { updated: result.modifiedCount || 0 };
    } catch (error) {
      console.error('Error fixing complete orders payment status:', error);
      throw new AppError('Failed to fix complete orders payment status', 500);
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
      let userId: string | undefined;
      if (order.user) {
        if (typeof order.user === 'object' && '_id' in order.user) {
          userId = (order.user as any)._id?.toString() || (order.user as any).id?.toString();
        } else {
          userId = order.user.toString();
        }
      }
      if (userId) {
        await this.clearCartItems(userId, order.cartItemIds || []);
      }
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

  private async calculateShippingFee(shippingAddress: IAddress): Promise<number> {
    try {
      // Get shipping fee based on the province/state code
      const provinceCode = shippingAddress.state;

      if (!provinceCode) {
        console.warn('No province code found in shipping address, using default fee');
        return 199.99; // Default shipping fee
      }

      // Use the shipping zone service to calculate the fee
      const shippingFee = await this.shippingZoneService.calculateShippingFee(provinceCode);

      return shippingFee;
    } catch (error) {
      console.error('Error calculating shipping fee:', error);
      // Return default fee if calculation fails
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
        } else if (product.productType === 'variable' && item.sku) {
          // Decrement quantity for specific variant
          const variant = await ProductVariant.findOne({ sku: item.sku, product: productId });

          if (!variant) {
            console.warn(`Variant not found for SKU: ${item.sku}`);
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