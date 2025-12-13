import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IPayout, IOrder, IOrderItem, ISeller, IUser } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';

export interface IPayoutService {
  createPayoutForOrder(orderId: string): Promise<IPayout[]>;
  getSellerEarnings(
    sellerId: string,
    filters?: {
      from?: Date;
      to?: Date;
      productId?: string;
      status?: 'PENDING' | 'PROCESSED' | 'FAILED';
    },
    page?: number,
    limit?: number
  ): Promise<{
    payouts: IPayout[];
    total: number;
    page: number;
    totalPages: number;
    totalEarnings: number;
  }>;
  exportEarningsCSV(sellerId: string, filters?: any): Promise<string>;
  setNotificationService(notificationService: any): void;
}

/**
 * Payout Service
 * Handles automatic payout creation when orders are delivered
 * and provides earnings queries for sellers
 */
@injectable()
export class PayoutService extends BaseService implements IPayoutService {
  private notificationService?: any;
  
  constructor(
    @inject(TYPES.Payout) private Payout: Model<IPayout>,
    @inject(TYPES.Order) private Order: Model<IOrder>,
    @inject(TYPES.Seller) private Seller: Model<ISeller>,
    @inject(TYPES.User) private User: Model<IUser>
  ) {
    super();
  }

  /**
   * Set notification service (called after NotificationService is initialized)
   */
  setNotificationService(notificationService: any): void {
    this.notificationService = notificationService;
  }

  /**
   * Create payout records for all sellers in an order when order status becomes 'COMPLETE' (delivered)
   * This should be called automatically when order status changes to COMPLETE
   */
  async createPayoutForOrder(orderId: string): Promise<IPayout[]> {
    try {
      const order = await this.Order.findById(orderId).populate({
        path: 'items.product',
        populate: { path: 'owner' }
      });
      if (!order) {
        throw new AppError('Order not found', 404);
      }

      if (order.orderStatus !== 'COMPLETE') {
        throw new AppError('Payouts can only be created for completed orders', 400);
      }

      // Check if payouts already exist for this order
      const existingPayouts = await this.Payout.find({ order_id: orderId });
      if (existingPayouts.length > 0) {
        return existingPayouts; // Return existing payouts
      }

      const payouts: IPayout[] = [];
      const sellerAmounts = new Map<string, { amount: number; items: any[] }>();

      // Group order items by seller
      for (const item of order.items) {
        const product = (item.product as any);
        if (!product || !product.owner) {
          continue; // Skip if product or owner not found
        }

        const sellerId = product.owner._id || product.owner;
        const amount = item.price * item.quantity;

        if (!sellerAmounts.has(sellerId.toString())) {
          sellerAmounts.set(sellerId.toString(), { amount: 0, items: [] });
        }

        const sellerData = sellerAmounts.get(sellerId.toString())!;
        sellerData.amount += amount;
        sellerData.items.push({
          itemId: item._id,
          productVariantId: item.product,
          quantity: item.quantity,
          unitPrice: item.price,
        });
      }

      // Create payout for each seller
      const sellerEntries = Array.from(sellerAmounts.entries());
      for (const [sellerId, data] of sellerEntries) {
        // If multiple items from same seller, create one payout per item or aggregate
        // For simplicity, creating one payout per seller (can be split per item if needed)
        const payout = await this.Payout.create({
          seller_id: sellerId,
          order_id: orderId,
          amount_paid: data.amount,
          payout_date: new Date(),
          status: 'PENDING',
        });

        payouts.push(payout);

        // Send notification to seller about new payout
        if (this.notificationService) {
          try {
            const payoutId = (payout._id as any).toString();
            await this.notificationService.sendPayoutNotificationToSeller(
              sellerId,
              payoutId,
              orderId,
              data.amount
            );
          } catch (error) {
            console.error('Failed to send payout notification to seller:', error);
            // Don't throw - notification failure shouldn't fail payout creation
          }
        }
      }

      return payouts;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to create payouts', 500);
    }
  }

  /**
   * Get seller earnings with filtering and pagination
   */
  async getSellerEarnings(
    sellerId: string,
    filters: {
      from?: Date;
      to?: Date;
      productId?: string;
      status?: 'PENDING' | 'PROCESSED' | 'FAILED';
    } = {},
    page: number = 1,
    limit: number = 20
  ): Promise<{
    payouts: IPayout[];
    total: number;
    page: number;
    totalPages: number;
    totalEarnings: number;
  }> {
    try {
      const query: any = { seller_id: sellerId };

      // Apply filters
      if (filters.from || filters.to) {
        query.payout_date = {};
        if (filters.from) {
          query.payout_date.$gte = filters.from;
        }
        if (filters.to) {
          query.payout_date.$lte = filters.to;
        }
      }

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.productId) {
        query.product_variant_id = filters.productId;
      }

      // Get total count
      const total = await this.Payout.countDocuments(query);

      // Get paginated results
      const skip = (page - 1) * limit;
      const payouts = await this.Payout.find(query)
        .sort({ payout_date: -1 })
        .skip(skip)
        .limit(limit)
        .populate('order_id', 'orderNumber totalPrice')
        .populate('product_variant_id', 'sku price');

      // Calculate total earnings (all time, not just filtered)
      const totalEarningsResult = await this.Payout.aggregate([
        { $match: { seller_id: sellerId, status: 'PROCESSED' } },
        { $group: { _id: null, total: { $sum: '$amount_paid' } } },
      ]);
      const totalEarnings = totalEarningsResult.length > 0 ? totalEarningsResult[0].total : 0;

      return {
        payouts,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        totalEarnings,
      };
    } catch (error) {
      throw new AppError('Failed to fetch seller earnings', 500);
    }
  }

  /**
   * Export seller earnings as CSV
   */
  async exportEarningsCSV(sellerId: string, filters: any = {}): Promise<string> {
    try {
      const query: any = { seller_id: sellerId };

      if (filters.from || filters.to) {
        query.payout_date = {};
        if (filters.from) query.payout_date.$gte = filters.from;
        if (filters.to) query.payout_date.$lte = filters.to;
      }

      const payouts = await this.Payout.find(query)
        .sort({ payout_date: -1 })
        .populate('order_id', 'orderNumber')
        .populate('product_variant_id', 'sku');

      // Generate CSV
      const headers = ['Date', 'Order Number', 'SKU', 'Amount', 'Status'];
      const rows = payouts.map((payout) => [
        payout.payout_date.toISOString().split('T')[0],
        (payout.order_id as any)?.orderNumber || 'N/A',
        (payout.product_variant_id as any)?.sku || 'N/A',
        payout.amount_paid.toFixed(2),
        payout.status,
      ]);

      const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
      return csv;
    } catch (error) {
      throw new AppError('Failed to export earnings CSV', 500);
    }
  }
}

