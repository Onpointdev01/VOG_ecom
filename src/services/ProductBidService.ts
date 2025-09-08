import { inject, injectable } from 'inversify';
import TYPES from '../di';
import { IBid, IProduct, IUser } from '../models';
import { Model } from 'mongoose';
import AppError from '../utils/errors/AppError';

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
    @inject(TYPES.Bid) private Bid: Model<IBid>
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

    // Check for existing active bids
    const existingBid = await this.Bid.findOne({
      product: productId,
      buyer: buyerId,
      status: { $in: ['PENDING', 'ACCEPTED'] },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (existingBid) {
      return {
        isValid: false,
        message: 'You can only place one bid per product in 24 hours',
      };
    }

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
      status: 'PENDING',
      isWithinPriceRange: true,
    });

    try {
      const savedBid = await newBid.save();

      if (!savedBid || !savedBid._id) {
        throw new AppError('Failed to create bid - document not saved properly', 500);
      }
      return savedBid;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Only one bid per product within 24 hours')) {
        throw new AppError('You can only place one bid per product in 24 hours', 400);
      }
      
      // Re-throw the original error if it's already an AppError
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError('Failed to create bid', 500);
    }
  }

  /**
   * Handle bid acceptance by seller
   */
  async acceptBid(bidId: string, sellerId: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);

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

    return await bid.save();
  }

  /**
   * Handle bid rejection by seller
   */
  async rejectBid(bidId: string, sellerId: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);

    if (!bid) {
      throw new AppError('Bid not found', 404);
    }

    // Ensure only the product owner can reject the bid
    if (bid.seller?.toString() !== sellerId) {
      throw new AppError('Unauthorized to reject this bid', 403);
    }

    // Update bid status and set cooldown
    bid.status = 'REJECTED';
    bid.cooldownUntil = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours cooldown

    return await bid.save();
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
      bid.status = 'EXPIRED';
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
      status: { $in: ['PENDING', 'ACCEPTED'] },
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
      .limit(limit);

    return { bids, total, page, totalPages };
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
      this.Bid.countDocuments({ status: 'PENDING' }),
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
   * Force accept a bid (admin override)
   */
  async forceAcceptBid(bidId: string, reason?: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);
    
    if (!bid) {
      throw new AppError('Bid not found', 404);
    }

    if (bid.status === 'ACCEPTED') {
      throw new AppError('Bid is already accepted', 400);
    }

    // Set expiration to 24 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    bid.status = 'ACCEPTED';
    bid.expiresAt = expiresAt;
    (bid as any).adminOverride = true;
    (bid as any).adminReason = reason;

    return await bid.save();
  }

  /**
   * Force reject a bid (admin override)
   */
  async forceRejectBid(bidId: string, reason?: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);
    
    if (!bid) {
      throw new AppError('Bid not found', 404);
    }

    if (bid.status === 'REJECTED') {
      throw new AppError('Bid is already rejected', 400);
    }

    bid.status = 'REJECTED';
    (bid as any).adminOverride = true;
    (bid as any).adminReason = reason;

    return await bid.save();
  }

  /**
   * Cancel a bid (admin action)
   */
  async cancelBid(bidId: string, reason: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);
    
    if (!bid) {
      throw new AppError('Bid not found', 404);
    }

    bid.status = 'CANCELLED';
    (bid as any).cancelledBy = 'ADMIN';
    (bid as any).cancellationReason = reason;
    (bid as any).cancelledAt = new Date();

    return await bid.save();
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
                cond: { $eq: ['$$this.status', 'PENDING'] }
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
      .sort({ createdAt: -1 });

    // Calculate statistics
    const totalBids = bids.length;
    const pendingBids = bids.filter(bid => bid.status === 'PENDING').length;
    const acceptedBids = bids.filter(bid => bid.status === 'ACCEPTED').length;
    const rejectedBids = bids.filter(bid => bid.status === 'REJECTED').length;
    const bidPrices = bids.map(bid => bid.bidPrice);
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
      bids: bids.map(bid => ({
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