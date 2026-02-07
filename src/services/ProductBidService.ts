import { inject, injectable } from 'inversify';
import TYPES from '../di';
import { IBid, IProduct, IUser } from '../models';
import { Model } from 'mongoose';
import AppError from '../utils/errors/AppError';
import { NotificationService } from './NotificationService';

export interface IProductBidService {
  validateBidSubmission(
    productId: string,
    buyerId: string,
    bidPrice: number
  ): Promise<{ isValid: boolean; message?: string }>;
  createBid(productId: string, buyerId: string, bidPrice: number): Promise<IBid>;
  acceptBid(bidId: string, sellerId: string): Promise<IBid>;
  rejectBid(bidId: string, sellerId: string): Promise<IBid>;
  checkBidExpiration(bidId: string): Promise<IBid | null>;
  getBidsForProduct(productId: string): Promise<IBid[]>;
  getBidById(bidId: string): Promise<IBid | null>;
  getUserBids(userId: string, status?: string, page?: number, limit?: number): Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }>;
  getSellerBids(sellerId: string, status?: string, page?: number, limit?: number): Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }>;
  markBidAsConverted(bidId: string): Promise<IBid>;
  
  // Admin methods
  getAllBidsForAdmin(filters: any, page: number, limit: number, search?: string): Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }>;
  getBidStatistics(): Promise<any>;
  forceAcceptBid(bidId: string, reason?: string): Promise<IBid>;
  forceRejectBid(bidId: string, reason?: string): Promise<IBid>;
  cancelBid(bidId: string, reason: string): Promise<IBid>;
  createCounterOffer(originalBidId: string, counterPrice: number, reason?: string): Promise<IBid>;
  getBidAnalytics(period: string, dateFrom?: string, dateTo?: string): Promise<any>;
  
  // Product-centric admin methods
  getProductsWithBids(filters: any, page: number, limit: number): Promise<{ products: any[]; total: number; page: number; totalPages: number }>;
  getProductBidsForAdmin(productId: string): Promise<any>;
  getDebugBidCounts(): Promise<any>;
}
@injectable()
export class ProductBidService implements IProductBidService {
  constructor(
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.Bid) private Bid: Model<IBid>,
    @inject(TYPES.NotificationService) private notificationService: NotificationService
  ) {}

  async validateBidSubmission(
    productId: string,
    buyerId: string,
    bidPrice: number
  ): Promise<{ isValid: boolean; message?: string }> {
    // Check if product exists
    const product = await this.Product.findById(productId);
    if (!product) {
      return { isValid: false, message: 'Product not found' };
    }

    // Check price range - only for products with defined price
    if (!product.price) {
      return {
        isValid: false,
        message: 'Cannot bid on products without a defined price (variable products)',
      };
    }
    
    const lowerBound = product.price * 0.75;
    const upperBound = product.price * 1.25;

    if (bidPrice < lowerBound || bidPrice > upperBound) {
      return {
        isValid: false,
        message: `Bid must be between $${lowerBound.toFixed(2)} and $${upperBound.toFixed(2)}`,
      };
    }

    // Removed: 24-hour restriction - users can now place unlimited bids
    // Users can place multiple bids on the same product (including multiple pending bids)
    // No restriction on pending bids - users can make multiple offers

    return { isValid: true };
  }

  /**
   * Create a new bid
   */
  async createBid(productId: string, buyerId: string, bidPrice: number): Promise<IBid> {
    // Validate bid first
    const validation = await this.validateBidSubmission(productId, buyerId, bidPrice);
    if (!validation.isValid) {
      throw new AppError(validation.message || 'error placing bid', 400);
    }

    // Find the product to get seller
    const product = await this.Product.findById(productId);
    if (!product) {
      throw new AppError('Product not found', 404);
    }

    // Create bid
    const newBid = new this.Bid({
      product: productId,
      buyer: buyerId,
      seller: product.owner,
      bidPrice,
      status: 'PENDING', // New bids start as PENDING
      isWithinPriceRange: true,
    });

    try {
      const savedBid = await newBid.save();

      if (!savedBid || !savedBid._id) {
        throw new AppError('Failed to create bid - document not saved properly', 500);
      }

      // Notify seller of new bid
      try {
        const buyer = await this.User.findById(buyerId);
        const buyerName = buyer ? `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || buyer.email : 'Buyer';
        const sellerId = (product.owner as any)._id || product.owner;
        
        await this.notificationService.sendNewBidNotificationToSeller(
          sellerId.toString(),
          savedBid._id.toString(),
          productId,
          product.name,
          buyerName,
          bidPrice
        );
      } catch (error) {
        console.error('Failed to send new bid notification to seller:', error);
        // Don't throw - notification failure shouldn't fail the bid creation
      }

      // Notify admins of new bid
      try {
        const buyer = await this.User.findById(buyerId);
        const buyerName = buyer ? `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || buyer.email : 'Buyer';
        
        await this.notificationService.sendNewBidNotificationToAdmins(
          savedBid._id.toString(),
          productId,
          product.name,
          buyerName,
          bidPrice
        );
      } catch (error) {
        console.error('Failed to send new bid notification to admins:', error);
        // Don't throw - notification failure shouldn't fail the bid creation
      }

      return savedBid;
    } catch (error: any) {
      // Log the actual error for debugging
      console.error('Error creating bid:', {
        error: error.message || error,
        stack: error.stack,
        productId,
        buyerId,
        bidPrice,
        errorName: error.name,
        errorCode: error.code
      });
      
      // Re-throw the original error if it's already an AppError
      if (error instanceof AppError) {
        throw error;
      }
      
      // Check for specific MongoDB errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message).join(', ');
        throw new AppError(`Validation error: ${validationErrors}`, 400);
      }
      
      if (error.name === 'MongoServerError' || error.code === 11000) {
        throw new AppError('A bid for this product already exists. Please wait before placing another bid.', 400);
      }
      
      // Provide more specific error message based on error type
      const errorMessage = error.message || 'Failed to create bid';
      throw new AppError(errorMessage.includes('Failed') ? errorMessage : `Failed to create bid: ${errorMessage}`, 500);
    }
  }

  /**
   * Handle bid acceptance by seller
   */
  async acceptBid(bidId: string, sellerId: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId).populate('product', 'name');

    if (!bid) {
      throw new AppError('Bid not found', 404);
    }

    // Ensure only the product owner can accept the bid
    if (bid.seller?.toString() !== sellerId) {
      throw new AppError('Unauthorized to accept this bid', 403);
    }

    // Update bid status and set expiration
    bid.status = 'ACCEPTED';
    bid.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const savedBid = await bid.save();

    // Send push notification to buyer
    if (bid.buyer) {
      try {
        const productName = (bid.product as any)?.name || 'Product';
        await this.notificationService.sendBidAcceptedNotification(
          bid.buyer.toString(),
          productName,
          bid.product.toString(),
          bid.bidPrice,
          bidId // Pass bidId to notification
        );
      } catch (error) {
        console.error('Failed to send bid accepted notification:', error);
        // Don't throw - notification failure shouldn't fail the bid acceptance
      }
    }

    return savedBid;
  }

  /**
   * Handle bid rejection by seller
   */
  async rejectBid(bidId: string, sellerId: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId).populate('product', 'name');

    if (!bid) {
      throw new AppError('Bid not found', 404);
    }

    // Ensure only the product owner can reject the bid
    if (bid.seller?.toString() !== sellerId) {
      throw new AppError('Unauthorized to reject this bid', 403);
    }

    // Check if bid is in a valid state to be rejected
    if (bid.status !== 'PENDING' && bid.status !== 'open') {
      throw new AppError(`Cannot reject bid with status: ${bid.status}`, 400);
    }

    // Update bid status and set cooldown
    bid.status = 'REJECTED';
    bid.cooldownUntil = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours cooldown

    const savedBid = await bid.save();

    // Send push notification to buyer
    if (bid.buyer) {
      try {
        const productName = (bid.product as any)?.name || 'Product';
        await this.notificationService.sendBidRejectedNotification(
          bid.buyer.toString(),
          productName,
          bid.product.toString(),
          bidId // Pass bidId to notification
        );
      } catch (error) {
        console.error('Failed to send bid rejected notification:', error);
        // Don't throw - notification failure shouldn't fail the bid rejection
      }
    }

    return savedBid;
  }

  /**
   * Check bid expiration and update status
   */
  async checkBidExpiration(bidId: string): Promise<IBid | null> {
    const bid = await this.Bid.findById(bidId);

    if (!bid || bid.status !== 'ACCEPTED') {
      return null;
    }

    // Check if bid has expired
    if (bid.expiresAt && bid.expiresAt < new Date()) {
      bid.status = 'expired';
      return await bid.save();
    }

    return bid;
  }

  /**
   * Get bids for a specific product
   */
  async getBidsForProduct(productId: string): Promise<IBid[]> {
    return await this.Bid.find({
      product: productId,
      status: { $in: ['PENDING', 'open', 'ACCEPTED'] },
    })
      .populate('buyer', 'firstName lastName email')
      .sort({ createdAt: -1 });
  }

  /**
   * Get a specific bid by ID
   */
  async getBidById(bidId: string): Promise<IBid | null> {
    return await this.Bid.findById(bidId)
      .populate('buyer', 'firstName lastName email')
      .populate('seller', 'name')
      .populate('product', 'name images price');
  }

  /**
   * Get bids for a specific user (buyer)
   */
  async getUserBids(
    userId: string, 
    status?: string, 
    page: number = 1, 
    limit: number = 10
  ): Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }> {
    const filter: any = { buyer: userId };
    
    if (status) {
      filter.status = status.toUpperCase();
    }

    const skip = (page - 1) * limit;
    const total = await this.Bid.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    const bids = await this.Bid.find(filter)
      .populate('product', 'name images price')
      .populate('seller', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return { bids, total, page, totalPages };
  }

  /**
   * Get bids for a specific seller
   */
  async getSellerBids(
    sellerId: string, 
    status?: string, 
    page: number = 1, 
    limit: number = 10
  ): Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }> {
    const filter: any = { seller: sellerId };
    
    if (status) {
      filter.status = status.toUpperCase();
    }

    const skip = (page - 1) * limit;
    const total = await this.Bid.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    const bids = await this.Bid.find(filter)
      .populate('buyer', 'firstName lastName email')
      .populate('product', 'name images price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return { bids, total, page, totalPages };
  }

  /**
   * Mark bid as converted to cart
   */
  async markBidAsConverted(bidId: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);
    
    if (!bid) {
      throw new AppError('Bid not found', 404);
    }

    // Add a converted flag to track this
    (bid as any).convertedToCart = true;
    (bid as any).convertedAt = new Date();
    
    return await bid.save();
  }

  // =====================================
  // ADMIN METHODS
  // =====================================

  /**
   * Get all bids for admin with filtering and pagination
   */
  async getAllBidsForAdmin(
    filters: any, 
    page: number, 
    limit: number, 
    search?: string
  ): Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }> {
    const query: any = { ...filters };

    // Add search functionality (search by product name or user email)
    if (search) {
      const searchProducts = await this.Product.find({
        name: { $regex: search, $options: 'i' }
      }).select('_id');
      
      const searchUsers = await this.User.find({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      query.$or = [
        { product: { $in: searchProducts.map(p => p._id) } },
        { buyer: { $in: searchUsers.map(u => u._id) } },
        { seller: { $in: searchUsers.map(u => u._id) } }
      ];
    }

    const total = await this.Bid.countDocuments(query);
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const bids = await this.Bid.find(query)
      .populate('buyer', 'firstName lastName email')
      .populate('seller', 'firstName lastName email')
      .populate('product', 'name images price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Filter out bids from deleted users (where buyer is null after population)
    const bidsWithBuyers = (bids as any[]).filter(bid => {
      if (!bid.buyer) {
        console.log(`⚠️ [getAllBidsForAdmin] Filtering out bid ${bid._id || bid.id} - buyer is deleted`);
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
      total: totalWithUsers, 
      page, 
      totalPages: Math.ceil(totalWithUsers / limit) 
    };
  }

  /**
   * Get bid statistics for admin dashboard
   */
  async getBidStatistics(): Promise<any> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalBids,
      pendingBids,
      acceptedBids,
      rejectedBids,
      todayBids,
      weekBids,
      monthBids,
      avgBidPrice,
      topProducts,
      totalProducts
    ] = await Promise.all([
      this.Bid.countDocuments(),
      this.Bid.countDocuments({ status: { $in: ['PENDING', 'open'] } }),
      this.Bid.countDocuments({ status: 'ACCEPTED' }),
      this.Bid.countDocuments({ status: 'REJECTED' }),
      this.Bid.countDocuments({ createdAt: { $gte: startOfDay } }),
      this.Bid.countDocuments({ createdAt: { $gte: startOfWeek } }),
      this.Bid.countDocuments({ createdAt: { $gte: startOfMonth } }),
      this.Bid.aggregate([
        { $group: { _id: null, avg: { $avg: '$bidPrice' } } }
      ]),
      this.Bid.aggregate([
        { $group: { _id: '$product', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $project: {
            productName: '$product.name',
            bidCount: '$count'
          }
        }
      ]),
      // Count distinct products that have bids
      this.Bid.aggregate([
        { $group: { _id: '$product' } },
        { $count: 'totalProducts' }
      ])
    ]);

    return {
      totalProducts: totalProducts[0]?.totalProducts || 0,
      totalBids,
      pendingBids,
      acceptedBids,
      rejectedBids,
      todayBids,
      weekBids,
      monthBids,
      avgBidPrice: avgBidPrice[0]?.avg || 0,
      topProducts,
      acceptanceRate: totalBids > 0 ? ((acceptedBids / totalBids) * 100).toFixed(2) : 0
    };
  }

  /**
   * Force accept a bid (admin only)
   */
  async forceAcceptBid(bidId: string, reason?: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId).populate('product', 'name');
    
    if (!bid) {
      throw new AppError('Bid not found', 404);
    }

    if (bid.status === 'ACCEPTED') {
      throw new AppError('Bid is already accepted', 400);
    }

    // Check if bid can be accepted (must be PENDING or open)
    if (bid.status !== 'PENDING' && bid.status !== 'open') {
      throw new AppError(`Cannot accept bid with status: ${bid.status}. Only PENDING bids can be accepted.`, 400);
    }

    // Set expiration to 24 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    bid.status = 'ACCEPTED';
    bid.expiresAt = expiresAt;
    (bid as any).adminOverride = true;
    (bid as any).adminReason = reason;

    const savedBid = await bid.save();
    
    // Log to verify status was saved correctly
    console.log(`[forceAcceptBid] Bid ${bidId} saved with status:`, savedBid.status);
    
    // Verify the status was actually saved by fetching it again
    const verifyBid = await this.Bid.findById(bidId);
    if (verifyBid && verifyBid.status !== 'ACCEPTED') {
      console.error(`[forceAcceptBid] WARNING: Bid ${bidId} status mismatch! Expected: ACCEPTED, Got: ${verifyBid.status}`);
    }

    // Send notification to buyer
    if (bid.buyer) {
      try {
        const productName = (bid.product as any)?.name || 'Product';
        await this.notificationService.sendBidAcceptedNotification(
          bid.buyer.toString(),
          productName,
          bid.product.toString(),
          bid.bidPrice,
          bidId
        );
      } catch (error) {
        console.error('Failed to send bid accepted notification:', error);
        // Don't throw - notification failure shouldn't fail the bid acceptance
      }
    }

    return savedBid;
  }

  /**
   * Force reject a bid (admin only)
   */
  async forceRejectBid(bidId: string, reason?: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId).populate('product', 'name');
    
    if (!bid) {
      throw new AppError('Bid not found', 404);
    }

    if (bid.status === 'REJECTED') {
      throw new AppError('Bid is already rejected', 400);
    }

    // Check if bid can be rejected (must be PENDING or open)
    if (bid.status !== 'PENDING' && bid.status !== 'open') {
      throw new AppError(`Cannot reject bid with status: ${bid.status}. Only PENDING bids can be rejected.`, 400);
    }

    bid.status = 'REJECTED';
    bid.cooldownUntil = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours cooldown
    (bid as any).adminOverride = true;
    (bid as any).adminReason = reason;

    const savedBid = await bid.save();

    // Send notification to buyer
    if (bid.buyer) {
      try {
        const productName = (bid.product as any)?.name || 'Product';
        await this.notificationService.sendBidRejectedNotification(
          bid.buyer.toString(),
          productName,
          bid.product.toString(),
          bidId,
          reason // Include reason in notification
        );
      } catch (error) {
        console.error('Failed to send bid rejected notification:', error);
        // Don't throw - notification failure shouldn't fail the bid rejection
      }
    }

    return savedBid;
  }

  /**
   * Cancel a bid (admin action)
   */
  async cancelBid(bidId: string, reason: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId).populate('product', 'name');
    
    if (!bid) {
      throw new AppError('Bid not found', 404);
    }

    if (bid.status === 'CANCELLED') {
      throw new AppError('Bid is already cancelled', 400);
    }

    bid.status = 'CANCELLED';
    (bid as any).cancelledBy = 'ADMIN';
    (bid as any).cancellationReason = reason;
    (bid as any).cancelledAt = new Date();

    const savedBid = await bid.save();

    // Send notification to buyer
    if (bid.buyer) {
      try {
        const productName = (bid.product as any)?.name || 'Product';
        await this.notificationService.sendPushNotification(
          bid.buyer.toString(),
          'Bid Cancelled',
          `Your bid on ${productName} has been cancelled by admin. Reason: ${reason}`,
          { type: 'bid', bidId, productId: bid.product.toString() }
        );
      } catch (error) {
        console.error('Failed to send bid cancellation notification:', error);
        // Don't throw - notification failure shouldn't fail the bid cancellation
      }
    }

    return savedBid;
  }

  /**
   * Create a counter offer (admin/seller proposes a different price)
   */
  async createCounterOffer(originalBidId: string, counterPrice: number, reason?: string): Promise<IBid> {
    const originalBid = await this.Bid.findById(originalBidId).populate('product', 'name price');
    
    if (!originalBid) {
      throw new AppError('Original bid not found', 404);
    }

    if (originalBid.status !== 'PENDING' && originalBid.status !== 'open') {
      throw new AppError(`Cannot create counter offer for bid with status: ${originalBid.status}`, 400);
    }

    // Validate counter price
    const product = originalBid.product as any;
    if (!product || !product.price) {
      throw new AppError('Product price not found', 400);
    }

    const lowerBound = product.price * 0.75;
    const upperBound = product.price * 1.25;

    if (counterPrice < lowerBound || counterPrice > upperBound) {
      throw new AppError(`Counter offer must be between $${lowerBound.toFixed(2)} and $${upperBound.toFixed(2)}`, 400);
    }

    // Mark original bid as countered
    originalBid.status = 'countered';
    await originalBid.save();

    // Create new bid with counter price
    const counterBid = new this.Bid({
      product: originalBid.product,
      buyer: originalBid.buyer,
      seller: originalBid.seller,
      bidPrice: counterPrice,
      status: 'PENDING', // Counter offer starts as pending, waiting for buyer response
      isWithinPriceRange: true,
    });

    const savedCounterBid = await counterBid.save();

    // Send notification to buyer
    if (originalBid.buyer) {
      try {
        const productName = product.name || 'Product';
        await this.notificationService.sendCounterOfferNotification(
          originalBid.buyer.toString(),
          productName,
          originalBid.product.toString(),
          counterPrice
        );
      } catch (error) {
        console.error('Failed to send counter offer notification:', error);
      }
    }

    return savedCounterBid;
  }

  /**
   * Get bid analytics for admin reporting
   */
  async getBidAnalytics(period: string, dateFrom?: string, dateTo?: string): Promise<any> {
    const matchStage: any = {};
    
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo) matchStage.createdAt.$lte = new Date(dateTo);
    }

    let groupStage: any;
    
    switch (period) {
      case 'daily':
        groupStage = {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            totalBids: { $sum: 1 },
            acceptedBids: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
            rejectedBids: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
            avgBidPrice: { $avg: '$bidPrice' }
          }
        };
        break;
      case 'weekly':
        groupStage = {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              week: { $week: '$createdAt' }
            },
            totalBids: { $sum: 1 },
            acceptedBids: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
            rejectedBids: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
            avgBidPrice: { $avg: '$bidPrice' }
          }
        };
        break;
      case 'monthly':
        groupStage = {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            totalBids: { $sum: 1 },
            acceptedBids: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
            rejectedBids: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
            avgBidPrice: { $avg: '$bidPrice' }
          }
        };
        break;
      default:
        throw new AppError('Invalid period. Use daily, weekly, or monthly', 400);
    }

    const analytics = await this.Bid.aggregate([
      { $match: matchStage },
      groupStage,
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } }
    ]);

    return analytics;
  }

  // =====================================
  // PRODUCT-CENTRIC ADMIN METHODS
  // =====================================

  /**
   * Get products with bid statistics for admin dashboard
   */
  async getProductsWithBids(
    filters: any, 
    page: number, 
    limit: number
  ): Promise<{ products: any[]; total: number; page: number; totalPages: number }> {
    const { search } = filters;
    
    // Build aggregation pipeline
    const pipeline: any[] = [
      // Match products that have bids
      {
        $lookup: {
          from: 'bids',
          localField: '_id',
          foreignField: 'product',
          as: 'bids'
        }
      },
      {
        $match: {
          'bids.0': { $exists: true } // Only products with at least one bid
        }
      },
      // Populate seller information
      {
        $lookup: {
          from: 'sellers',
          localField: 'owner',
          foreignField: '_id',
          as: 'seller'
        }
      },
      {
        $unwind: '$seller'
      },
      // Populate the user info from seller
      {
        $lookup: {
          from: 'users',
          localField: 'seller.user',
          foreignField: '_id',
          as: 'sellerUser'
        }
      },
      {
        $unwind: '$sellerUser'
      },
      // Add search functionality
      ...(search ? [{
        $match: {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { 'sellerUser.firstName': { $regex: search, $options: 'i' } },
            { 'sellerUser.lastName': { $regex: search, $options: 'i' } },
            { 'sellerUser.email': { $regex: search, $options: 'i' } },
            { 'seller.name': { $regex: search, $options: 'i' } }
          ]
        }
      }] : []),
      // Calculate bid statistics
      {
        $addFields: {
          bidCount: { $size: '$bids' },
          pendingBids: {
            $size: {
              $filter: {
                input: '$bids',
                cond: { $in: ['$$this.status', ['PENDING', 'open']] }
              }
            }
          },
          acceptedBids: {
            $size: {
              $filter: {
                input: '$bids',
                cond: { $eq: ['$$this.status', 'ACCEPTED'] }
              }
            }
          },
          highestBid: { $max: '$bids.bidPrice' },
          lowestBid: { $min: '$bids.bidPrice' },
          avgBidPrice: { $avg: '$bids.bidPrice' },
          latestBidDate: { $max: '$bids.createdAt' }
        }
      },
      // Project final fields
      {
        $project: {
          id: '$_id',
          name: 1,
          price: 1,
          images: 1,
          seller: {
            _id: '$sellerUser._id',
            firstName: '$sellerUser.firstName',
            lastName: '$sellerUser.lastName',
            email: '$sellerUser.email'
          },
          bidCount: 1,
          pendingBids: 1,
          acceptedBids: 1,
          highestBid: 1,
          lowestBid: 1,
          avgBidPrice: 1,
          latestBidDate: 1
        }
      },
      // Sort by latest bid activity
      {
        $sort: { latestBidDate: -1 }
      }
    ];

    // Get total count for pagination
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await this.Product.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // Add pagination
    const skip = (page - 1) * limit;
    pipeline.push({ $skip: skip }, { $limit: limit });

    const products = await this.Product.aggregate(pipeline);

    return { products, total, page, totalPages };
  }

  /**
   * Get all bids for a specific product with product details and statistics
   */
  async getProductBidsForAdmin(productId: string): Promise<any> {
    // Get product details
    const product = await this.Product.findById(productId)
      .populate('owner', 'firstName lastName email');

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    // Get all bids for this product
    const bids = await this.Bid.find({ product: productId })
      .populate('buyer', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    // Filter out bids from deleted users (where buyer is null after population)
    const bidsWithBuyers = (bids as any[]).filter(bid => {
      if (!bid.buyer) {
        console.log(`⚠️ [getProductBidsForAdmin] Filtering out bid ${bid._id || bid.id} - buyer is deleted`);
        return false;
      }
      return true;
    });

    // Calculate statistics
    const totalBids = bidsWithBuyers.length;
    const pendingBids = bidsWithBuyers.filter(bid => bid.status === 'PENDING' || bid.status === 'open').length;
    const acceptedBids = bidsWithBuyers.filter(bid => bid.status === 'ACCEPTED').length;
    const rejectedBids = bidsWithBuyers.filter(bid => bid.status === 'REJECTED').length;
    const bidPrices = bidsWithBuyers.map(bid => bid.bidPrice);
    const highestBid = bidPrices.length > 0 ? Math.max(...bidPrices) : 0;
    const lowestBid = bidPrices.length > 0 ? Math.min(...bidPrices) : 0;
    const avgBidPrice = bidPrices.length > 0 ? bidPrices.reduce((a, b) => a + b, 0) / bidPrices.length : 0;

    return {
      product: {
        id: product._id,
        name: product.name,
        price: product.price,
        images: product.images,
        description: product.description,
        seller: {
          _id: (product.owner as any)._id,
          firstName: (product.owner as any).firstName,
          lastName: (product.owner as any).lastName,
          email: (product.owner as any).email
        }
      },
      bids: bidsWithBuyers.map(bid => ({
        id: bid._id,
        buyer: bid.buyer,
        bidPrice: bid.bidPrice,
        status: bid.status,
        createdAt: bid.createdAt,
        updatedAt: bid.updatedAt,
        expiresAt: bid.expiresAt,
        adminOverride: (bid as any).adminOverride,
        adminReason: (bid as any).adminReason
      })),
      statistics: {
        totalBids,
        pendingBids,
        acceptedBids,
        rejectedBids,
        highestBid,
        lowestBid,
        avgBidPrice
      }
    };
  }

  /**
   * Debug method to check database contents and aggregation
   */
  async getDebugBidCounts(): Promise<any> {
    const totalBids = await this.Bid.countDocuments();
    const totalProducts = await this.Product.countDocuments();
    const totalUsers = await this.User.countDocuments();
    
    // Get sample bids with populated data
    const sampleBids = await this.Bid.find().limit(5).populate('product', 'name').populate('buyer', 'firstName lastName');
    
    // Get products with at least one bid using direct query
    const productsWithBids = await this.Bid.distinct('product');
    
    // Test the aggregation step by step
    const step1 = await this.Product.aggregate([
      {
        $lookup: {
          from: 'bids',
          localField: '_id',
          foreignField: 'product',
          as: 'bids'
        }
      },
      { $limit: 5 }
    ]);
    
    const step2 = await this.Product.aggregate([
      {
        $lookup: {
          from: 'bids',
          localField: '_id',
          foreignField: 'product',
          as: 'bids'
        }
      },
      {
        $match: {
          'bids.0': { $exists: true }
        }
      },
      { $limit: 5 }
    ]);
    
    return {
      totalBids,
      totalProducts,
      totalUsers,
      productsWithBidsCount: productsWithBids.length,
      sampleBids: sampleBids.map(bid => ({
        id: bid._id,
        product: bid.product,
        buyer: bid.buyer,
        bidPrice: bid.bidPrice,
        status: bid.status,
        createdAt: bid.createdAt
      })),
      productsWithBids,
      aggregationStep1: step1.map(p => ({
        id: p._id,
        name: p.name,
        bidsCount: p.bids?.length || 0,
        hasBids: p.bids && p.bids.length > 0
      })),
      aggregationStep2: step2.map(p => ({
        id: p._id,
        name: p.name,
        bidsCount: p.bids?.length || 0
      }))
    };
  }
}
