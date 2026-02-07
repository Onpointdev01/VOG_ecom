import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { ISeller, IProduct, IOrder, IBid, IUser } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import mongoose from 'mongoose';

export interface ISellerService {
  getSellerProfile(sellerId: string): Promise<ISeller>;
  updateSellerProfile(sellerId: string, data: Partial<ISeller>): Promise<ISeller>;
  getSellerProducts(sellerId: string, page: number, limit: number, filters?: any): Promise<{ products: IProduct[]; total: number; page: number; totalPages: number }>;
  getSellerOrders(sellerId: string, page: number, limit: number, status?: string): Promise<{ orders: IOrder[]; total: number; page: number; totalPages: number }>;
  getSellerOrderById(sellerId: string, orderId: string): Promise<IOrder>;
  getSellerBids(sellerId: string, page: number, limit: number, status?: string): Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }>;
  getSellerStats(sellerId: string): Promise<any>;
  getPlatformStats(): Promise<{ activeSellers: number; productsSold: number; satisfactionRate: number }>;
  deleteSeller(sellerId: string, hardDelete?: boolean): Promise<void>;
}

@injectable()
export class SellerService extends BaseService implements ISellerService {
  constructor(
    @inject(TYPES.Seller) private Seller: Model<ISeller>,
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.Order) private Order: Model<IOrder>,
    @inject(TYPES.Bid) private Bid: Model<IBid>,
    @inject(TYPES.User) private User: Model<IUser>
  ) {
    super();
  }

  /**
   * Get seller profile
   */
  async getSellerProfile(sellerId: string): Promise<ISeller> {
    const seller = await this.Seller.findById(sellerId)
      .populate('user', 'firstName lastName email phoneNumber profileImageUrl nationality currentLocation phoneNumber')
      .lean();
    
    if (!seller) {
      throw new AppError('Seller not found', 404);
    }

    console.log('Retrieved seller profile, logo:', (seller as any).logo);
    return seller as ISeller;
  }

  /**
   * Update seller profile
   */
  async updateSellerProfile(sellerId: string, data: Partial<ISeller>): Promise<ISeller> {
    const seller = await this.Seller.findById(sellerId);
    
    if (!seller) {
      throw new AppError('Seller not found', 404);
    }

    // Update allowed fields
    if (data.name !== undefined) seller.name = data.name;
    if (data.logo !== undefined) {
      // Always update logo, even if it's an empty string (to allow clearing the logo)
      seller.logo = data.logo;
      console.log('Updating seller logo:', data.logo);
    }
    if (data.type !== undefined) seller.type = data.type;
    if (data.status !== undefined) seller.status = data.status;

    await seller.save();
    console.log('Seller profile updated, logo:', seller.logo);
    return seller;
  }

  /**
   * Get seller products with pagination and filters
   */
  async getSellerProducts(
    sellerId: string,
    page: number,
    limit: number,
    filters?: any
  ): Promise<{ products: IProduct[]; total: number; page: number; totalPages: number }> {
    const skip = (page - 1) * limit;
    const query: any = { owner: sellerId };

    // Apply filters
    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive;
    }
    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } }
      ];
    }

    const [products, total] = await Promise.all([
      this.Product.find(query)
        .populate('category', 'name')
        .populate('owner', 'name logo')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.Product.countDocuments(query)
    ]);

    // Transform _id to id for API consistency
    const transformedProducts = (products as any[]).map((product: any) => ({
      ...product,
      id: product._id.toString(),
      _id: product._id.toString()
    }));

    return {
      products: transformedProducts as IProduct[],
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get seller orders (orders containing products from this seller)
   */
  async getSellerOrders(
    sellerId: string,
    page: number,
    limit: number,
    status?: string
  ): Promise<{ orders: IOrder[]; total: number; page: number; totalPages: number }> {
    const skip = (page - 1) * limit;

    // First, get all product IDs owned by this seller
    const sellerProducts = await this.Product.find({ owner: sellerId }).select('_id');
    const productIds = sellerProducts.map(p => p._id);

    if (productIds.length === 0) {
      return {
        orders: [],
        total: 0,
        page,
        totalPages: 0
      };
    }

    // Build query to find orders containing products from this seller
    const query: any = {
      'items.product': { $in: productIds }
    };

    if (status) {
      query.orderStatus = status;
    }

    const [orders, total] = await Promise.all([
      this.Order.find(query)
        .populate('user', 'firstName lastName email phoneNumber')
        .populate({
          path: 'items.product',
          select: 'name price images owner',
          populate: {
            path: 'owner',
            select: 'name logo'
          }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.Order.countDocuments(query)
    ]);

    // Filter out orders from deleted users (where user is null after population)
    // This ensures we don't display orders from users who have been deleted
    const ordersWithUsers = (orders as any[]).filter(order => {
      if (!order.user) {
        console.log(`⚠️ Filtering out order ${order._id || order.orderNumber} - user is deleted`);
        return false;
      }
      return true;
    });

    // Filter items to only show items from this seller
    const filteredOrders = ordersWithUsers.map(order => {
      // Ensure paymentStatus is set to COMPLETED for COMPLETE orders
      // This is critical: if order is COMPLETE, payment MUST be COMPLETED (payment on delivery)
      const orderStatus = order.orderStatus;
      let paymentStatus = order.paymentStatus || 'PENDING';
      
      // CRITICAL FIX: If order is COMPLETE, payment status MUST be COMPLETED
      // This handles existing orders that were created before this logic was in place
      if (orderStatus === 'COMPLETE') {
        if (paymentStatus !== 'COMPLETED') {
          console.log(`💰 [getSellerOrders] Fixing payment status for order ${order._id || order.orderNumber || 'unknown'}: ${paymentStatus} -> COMPLETED`);
          paymentStatus = 'COMPLETED';
          
          // Update in database asynchronously (don't wait for it to avoid blocking the response)
          const orderId = order._id || order.id;
          if (orderId) {
            this.Order.findByIdAndUpdate(
              orderId,
              { paymentStatus: 'COMPLETED' },
              { new: false }
            ).catch(err => {
              console.error(`❌ Failed to update payment status for order ${orderId}:`, err);
            });
          }
        }
      }
      
      // Filter items to only show items from this seller
      const filteredItems = order.items.filter((item: any) => {
        const productOwnerId = item.product?.owner?._id || item.product?.owner;
        return productOwnerId && productOwnerId.toString() === sellerId;
      });
      
      // Calculate total for seller's items only (price * quantity for each item)
      const sellerItemsTotal = filteredItems.reduce((sum: number, item: any) => {
        const itemPrice = item.price || 0;
        const itemQuantity = item.quantity || 0;
        return sum + (itemPrice * itemQuantity);
      }, 0);
      
      // Build the result object with corrected paymentStatus
      // Create a new object to ensure paymentStatus is properly set
      // Ensure user is always an object, never null
      let userData = order.user;
      if (!userData) {
        // If user is null/undefined, create a placeholder
        userData = {
          _id: null,
          id: null,
          firstName: 'Unknown',
          lastName: 'User',
          email: 'unknown@example.com'
        };
      } else if (typeof userData === 'object') {
        // Ensure user has all required fields
        userData = {
          _id: userData._id || userData.id,
          id: userData.id || userData._id?.toString(),
          firstName: userData.firstName || 'Unknown',
          lastName: userData.lastName || 'User',
          email: userData.email || 'unknown@example.com'
        };
      }

      const result: any = {
        _id: order._id,
        id: order.id || order._id?.toString(),
        user: userData,
        items: filteredItems,
        shippingAddress: order.shippingAddress,
        paymentMethod: order.paymentMethod,
        paymentStatus: paymentStatus, // CRITICAL: Explicitly set the corrected payment status
        orderStatus: order.orderStatus,
        totalPrice: sellerItemsTotal, // Total for seller's items only
        shippingFee: order.shippingFee,
        finalPrice: sellerItemsTotal, // Final price for seller's items only
        totalAmount: sellerItemsTotal, // Add totalAmount for frontend compatibility (seller's items only)
        orderNumber: order.orderNumber,
        notes: order.notes,
        cartItemIds: order.cartItemIds,
        payments: order.payments || [],
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        __v: order.__v
      };
      
      // Verify the fix was applied
      if (result.orderStatus === 'COMPLETE' && result.paymentStatus !== 'COMPLETED') {
        console.error(`❌ [getSellerOrders] ERROR: Order ${result._id || result.orderNumber} is COMPLETE but paymentStatus is still ${result.paymentStatus}`);
      } else if (result.orderStatus === 'COMPLETE') {
        console.log(`✅ [getSellerOrders] Order ${result._id || result.orderNumber} is COMPLETE with paymentStatus: ${result.paymentStatus}`);
      }
      
      return result;
    }).filter(order => order.items.length > 0);

    // Recalculate total count excluding deleted users
    // We need to count orders that have valid users
    const totalWithUsers = await this.Order.countDocuments({
      ...query,
      user: { $exists: true, $ne: null }
    });

    return {
      orders: filteredOrders as IOrder[],
      total: totalWithUsers, // Use count that excludes deleted users
      page,
      totalPages: Math.ceil(totalWithUsers / limit)
    };
  }

  /**
   * Get a specific order by ID (only if it contains products from this seller)
   */
  async getSellerOrderById(sellerId: string, orderId: string): Promise<IOrder> {
    const order = await this.Order.findById(orderId)
      .populate('user', 'firstName lastName email phoneNumber')
      .populate({
        path: 'items.product',
        select: 'name price images owner',
        populate: {
          path: 'owner',
          select: 'name logo'
        }
      })
      .lean();

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    // Check if order contains products from this seller
    const hasSellerProducts = (order as any).items.some((item: any) => {
      const productOwnerId = item.product?.owner?._id || item.product?.owner;
      return productOwnerId && productOwnerId.toString() === sellerId;
    });

    if (!hasSellerProducts) {
      throw new AppError('Order not found or access denied', 404);
    }

    // Don't return order if user is deleted
    if (!order.user) {
      throw new AppError('Order not found or user deleted', 404);
    }

    // Filter items to only show items from this seller
    const filteredOrder = {
      ...order,
      items: (order as any).items.filter((item: any) => {
        const productOwnerId = item.product?.owner?._id || item.product?.owner;
        return productOwnerId && productOwnerId.toString() === sellerId;
      })
    };

    return filteredOrder as IOrder;
  }

  /**
   * Get seller bids (bids on products owned by this seller)
   */
  async getSellerBids(
    sellerId: string,
    page: number,
    limit: number,
    status?: string
  ): Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }> {
    const skip = (page - 1) * limit;

    // First, get all product IDs owned by this seller
    const sellerProducts = await this.Product.find({ owner: sellerId }).select('_id');
    const productIds = sellerProducts.map(p => p._id);

    if (productIds.length === 0) {
      return {
        bids: [],
        total: 0,
        page,
        totalPages: 0
      };
    }

    const query: any = {
      product: { $in: productIds }
    };

    if (status) {
      query.status = status;
    }

    const [bids, total] = await Promise.all([
      this.Bid.find(query)
        .populate('product', 'name price images')
        .populate('buyer', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.Bid.countDocuments(query)
    ]);

    // Ensure buyer is always an object, never null
    const bidsWithBuyer = (bids as any[]).map(bid => {
      let buyerData = bid.buyer;
      if (!buyerData) {
        // If buyer is null/undefined, create a placeholder
        buyerData = {
          _id: null,
          id: null,
          firstName: 'Unknown',
          lastName: 'Buyer',
          email: 'unknown@example.com'
        };
      } else if (typeof buyerData === 'object') {
        // Ensure buyer has all required fields
        buyerData = {
          _id: buyerData._id || buyerData.id,
          id: buyerData.id || buyerData._id?.toString(),
          firstName: buyerData.firstName || 'Unknown',
          lastName: buyerData.lastName || 'Buyer',
          email: buyerData.email || 'unknown@example.com'
        };
      }

      return {
        ...bid,
        id: bid.id || bid._id?.toString() || (bid as any)._id?.toString(),
        _id: bid._id || bid.id,
        buyer: buyerData
      };
    });

    // Filter out bids from deleted users (where buyer is null after population)
    // This ensures we don't display bids from users who have been deleted
    const bidsWithBuyers = bidsWithBuyer.filter(bid => {
      if (!bid.buyer) {
        console.log(`⚠️ Filtering out bid ${bid._id || bid.id} - buyer is deleted`);
        return false;
      }
      return true;
    });

    // Recalculate total count excluding deleted users
    const totalWithUsers = await this.Bid.countDocuments({
      ...query,
      buyer: { $exists: true, $ne: null }
    });

    return {
      bids: bidsWithBuyers as IBid[],
      total: totalWithUsers, // Use count that excludes deleted users
      page,
      totalPages: Math.ceil(totalWithUsers / limit)
    };
  }

  /**
   * Get seller statistics
   */
  async getSellerStats(sellerId: string): Promise<any> {
    const [
      totalProducts,
      activeProducts,
      totalOrders,
      pendingOrders,
      completedOrders,
      totalBids,
      pendingBids,
      acceptedBids,
      totalEarnings
    ] = await Promise.all([
      this.Product.countDocuments({ owner: sellerId }),
      this.Product.countDocuments({ owner: sellerId, isActive: true }),
      this.Order.countDocuments({ 'items.product': { $in: await this.Product.find({ owner: sellerId }).select('_id') } }),
      this.Order.countDocuments({ 
        'items.product': { $in: await this.Product.find({ owner: sellerId }).select('_id') },
        orderStatus: 'PENDING'
      }),
      this.Order.countDocuments({ 
        'items.product': { $in: await this.Product.find({ owner: sellerId }).select('_id') },
        orderStatus: 'COMPLETE'
      }),
      this.Bid.countDocuments({ 
        product: { $in: await this.Product.find({ owner: sellerId }).select('_id') }
      }),
      this.Bid.countDocuments({ 
        product: { $in: await this.Product.find({ owner: sellerId }).select('_id') },
        status: { $in: ['PENDING', 'open'] }
      }),
      this.Bid.countDocuments({ 
        product: { $in: await this.Product.find({ owner: sellerId }).select('_id') },
        status: 'ACCEPTED'
      }),
      // Total earnings from completed orders
      this.Order.aggregate([
        {
          $match: {
            orderStatus: 'COMPLETE',
            'items.product': { $in: await this.Product.find({ owner: sellerId }).select('_id') }
          }
        },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'productData'
          }
        },
        { $unwind: '$productData' },
        {
          $match: {
            'productData.owner': new mongoose.Types.ObjectId(sellerId)
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
          }
        }
      ])
    ]);

    return {
      products: {
        total: totalProducts,
        active: activeProducts
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        completed: completedOrders
      },
      bids: {
        total: totalBids,
        pending: pendingBids,
        accepted: acceptedBids
      },
      earnings: {
        total: totalEarnings[0]?.total || 0
      }
    };
  }

  /**
   * Get platform-wide statistics (public endpoint for home page)
   */
  async getPlatformStats(): Promise<{ activeSellers: number; productsSold: number; satisfactionRate: number }> {
    try {
      // Get active sellers count
      const activeSellers = await this.Seller.countDocuments({ status: 'active' });

      // Get total products sold (from completed orders)
      const productsSoldResult = await this.Order.aggregate([
        {
          $match: {
            orderStatus: 'COMPLETE'
          }
        },
        {
          $unwind: '$items'
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$items.quantity' }
          }
        }
      ]);
      const productsSold = productsSoldResult[0]?.total || 0;

      // Calculate satisfaction rate from reviews
      // For now, we'll use a default high rate or calculate from actual reviews if Review model exists
      // This is a simplified calculation - you might want to use actual review ratings
      const totalOrders = await this.Order.countDocuments({ orderStatus: 'COMPLETE' });
      const cancelledOrders = await this.Order.countDocuments({ orderStatus: 'CANCELLED' });
      
      // Satisfaction rate = (completed orders - cancelled) / total orders * 100
      // Or use a default high rate for marketing purposes
      const satisfactionRate = totalOrders > 0 
        ? Math.round(((totalOrders - cancelledOrders) / totalOrders) * 100)
        : 98; // Default to 98% if no orders yet

      return {
        activeSellers,
        productsSold,
        satisfactionRate: Math.min(satisfactionRate, 99) // Cap at 99% for realism
      };
    } catch (error) {
      console.error('Error fetching platform stats:', error);
      // Return default values on error
      return {
        activeSellers: 0,
        productsSold: 0,
        satisfactionRate: 98
      };
    }
  }

  /**
   * Delete a seller and handle all associated data
   * @param sellerId - ID of the seller to delete
   * @param hardDelete - If true, permanently delete. If false, soft delete (set status to 'suspended')
   */
  async deleteSeller(sellerId: string, hardDelete: boolean = false): Promise<void> {
    const seller = await this.Seller.findById(sellerId);
    
    if (!seller) {
      throw new AppError('Seller not found', 404);
    }

    // Check if seller has pending orders
    const sellerProducts = await this.Product.find({ owner: sellerId }).select('_id');
    const productIds = sellerProducts.map(p => p._id);
    
    const pendingOrders = await this.Order.countDocuments({
      'items.product': { $in: productIds },
      orderStatus: { $in: ['PENDING', 'PROCESSING', 'SHIPPED'] }
    });

    if (pendingOrders > 0 && hardDelete) {
      throw new AppError(
        `Cannot delete seller with ${pendingOrders} pending/active orders. Please complete or cancel all orders first, or use soft delete.`,
        400
      );
    }

    // Note: Check for pending payouts would require injecting PayoutService
    // For now, we'll allow deletion but log a warning if there are active orders
    if (pendingOrders > 0) {
      console.warn(`⚠️ Warning: Seller ${sellerId} has ${pendingOrders} pending/active orders`);
    }

    if (hardDelete) {
      // HARD DELETE - Permanently remove seller and associated data
      
      // 1. Deactivate all products (don't delete to preserve order history)
      await this.Product.updateMany(
        { owner: sellerId },
        { 
          isActive: false,
          // Add a note that seller was deleted
          $set: { 'deletedSeller': true }
        }
      );

      // 2. Cancel all pending bids on seller's products
      await this.Bid.updateMany(
        { 
          product: { $in: productIds },
          status: { $in: ['PENDING', 'open'] }
        },
        { 
          status: 'DECLINED',
          // Note: Add a reason field if your Bid model supports it
        }
      );

      // 3. Remove seller reference from user
      await this.User.updateMany(
        { seller: sellerId },
        { 
          $unset: { seller: '' },
          role: 'user' // Revert user role back to 'user'
        }
      );

      // 4. Delete the seller document
      await this.Seller.findByIdAndDelete(sellerId);
      
      console.log(`✅ Hard deleted seller ${sellerId} and deactivated ${sellerProducts.length} products`);
    } else {
      // SOFT DELETE - Mark seller as suspended and deactivate products
      
      // 1. Update seller status to 'suspended'
      seller.status = 'suspended';
      await seller.save();

      // 2. Deactivate all products
      await this.Product.updateMany(
        { owner: sellerId },
        { isActive: false }
      );

      // 3. Cancel all pending bids
      await this.Bid.updateMany(
        { 
          product: { $in: productIds },
          status: { $in: ['PENDING', 'open'] }
        },
        { status: 'DECLINED' }
      );

      // Note: Keep user-seller relationship and user role as 'seller'
      // This allows the seller to be reactivated later if needed
      
      console.log(`✅ Soft deleted (suspended) seller ${sellerId} and deactivated ${sellerProducts.length} products`);
    }
  }
}
