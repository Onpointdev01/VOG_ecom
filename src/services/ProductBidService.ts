import { inject, injectable } from 'inversify';
import TYPES from '../di';
import { IBid, IProduct, IUser } from '../models';
import { Model } from 'mongoose';
import AppError from '../utils/errors/AppError';
// [SSE] add import
import { streamController } from '../realtime/streamController';

export interface IProductBidService {
  validateBidSubmission(productId: string, buyerId: string, bidPrice: number): Promise<{ isValid: boolean; message?: string }>;
  createBid(productId: string, buyerId: string, bidPrice: number): Promise<IBid>;
  acceptBid(bidId: string, sellerId: string): Promise<IBid>;
  rejectBid(bidId: string, sellerId: string): Promise<IBid>;
  checkBidExpiration(bidId: string): Promise<IBid | null>;
  getBidsForProduct(productId: string): Promise<IBid[]>;
  getBidById(bidId: string): Promise<IBid | null>;
  getUserBids(userId: string, status?: string, page?: number, limit?: number): Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }>;
  getSellerBids(sellerId: string, status?: string, page?: number, limit?: number): Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }>;
  markBidAsConverted(bidId: string): Promise<IBid>;

  getAllBidsForAdmin(filters: any, page: number, limit: number, search?: string): Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }>;
  getBidStatistics(): Promise<any>;
  forceAcceptBid(bidId: string, reason?: string): Promise<IBid>;
  forceRejectBid(bidId: string, reason?: string): Promise<IBid>;
  cancelBid(bidId: string, reason: string): Promise<IBid>;
  getBidAnalytics(period: string, dateFrom?: string, dateTo?: string): Promise<any>;
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

  async validateBidSubmission(productId: string, buyerId: string, bidPrice: number): Promise<{ isValid: boolean; message?: string }> {
    const product = await this.Product.findById(productId);
    if (!product) return { isValid: false, message: 'Product not found' };

    if (!product.price) {
      return { isValid: false, message: 'Cannot bid on products without a defined price (variable products)' };
    }
    
    const lowerBound = product.price * 0.75;
    const upperBound = product.price * 1.25;
    if (bidPrice < lowerBound || bidPrice > upperBound) {
      return { isValid: false, message: `Bid must be between $${lowerBound.toFixed(2)} and $${upperBound.toFixed(2)}` };
    }

    const existingBid = await this.Bid.findOne({
      product: productId,
      buyer: buyerId,
      status: { $in: ['PENDING', 'ACCEPTED'] },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (existingBid) {
      return { isValid: false, message: 'You can only place one bid per product in 24 hours' };
    }

    return { isValid: true };
  }

  async createBid(productId: string, buyerId: string, bidPrice: number): Promise<IBid> {
    const validation = await this.validateBidSubmission(productId, buyerId, bidPrice);
    if (!validation.isValid) throw new AppError(validation.message || 'error placing bid', 400);

    const product = await this.Product.findById(productId);
    if (!product) throw new AppError('Product not found', 404);

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

      // [SSE] optional: notify buyer a bid was created (lightweight)
      try {
        const buyer = (savedBid.buyer as any)?.toString?.() || savedBid.buyer;
        streamController.publishToUser(String(buyer), 'bid:update', {
          bidId: String(savedBid._id),
          productId: String(savedBid.product),
          status: 'PENDING',
          price: savedBid.bidPrice,
          createdAt: savedBid.createdAt,
        });
      } catch (e) { /* noop */ }

      if (!savedBid || !savedBid._id) throw new AppError('Failed to create bid - document not saved properly', 500);
      return savedBid;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Only one bid per product within 24 hours')) {
        throw new AppError('You can only place one bid per product in 24 hours', 400);
      }
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to create bid', 500);
    }
  }

  async acceptBid(bidId: string, sellerId: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);
    if (!bid) throw new AppError('Bid not found', 404);
    if (bid.seller?.toString() !== sellerId) throw new AppError('Unauthorized to accept this bid', 403);

    bid.status = 'ACCEPTED';
    bid.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const saved = await bid.save();

    // [SSE] notify buyer (minimal, no extra lookups)
    try {
      const buyer = (saved.buyer as any)?.toString?.() || saved.buyer;
      streamController.publishToUser(String(buyer), 'bid:update', {
        bidId: String(saved._id),
        productId: String(saved.product),
        status: 'ACCEPTED',
        price: saved.bidPrice,
        expiresAt: saved.expiresAt,
        createdAt: new Date().toISOString(),
      });
    } catch (e) { /* noop */ }

    return saved;
  }

  async rejectBid(bidId: string, sellerId: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);
    if (!bid) throw new AppError('Bid not found', 404);
    if (bid.seller?.toString() !== sellerId) throw new AppError('Unauthorized to reject this bid', 403);

    bid.status = 'REJECTED';
    bid.cooldownUntil = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const saved = await bid.save();

    // [SSE] notify buyer
    try {
      const buyer = (saved.buyer as any)?.toString?.() || saved.buyer;
      streamController.publishToUser(String(buyer), 'bid:update', {
        bidId: String(saved._id),
        productId: String(saved.product),
        status: 'REJECTED',
        price: saved.bidPrice,
        cooldownUntil: saved.cooldownUntil,
        createdAt: new Date().toISOString(),
      });
    } catch (e) { /* noop */ }

    return saved;
  }

  async checkBidExpiration(bidId: string): Promise<IBid | null> {
    const bid = await this.Bid.findById(bidId);
    if (!bid || bid.status !== 'ACCEPTED') return null;

    if (bid.expiresAt && bid.expiresAt < new Date()) {
      bid.status = 'EXPIRED';
      const saved = await bid.save();

      // [SSE] notify buyer
      try {
        const buyer = (saved.buyer as any)?.toString?.() || saved.buyer;
        streamController.publishToUser(String(buyer), 'bid:update', {
          bidId: String(saved._id),
          productId: String(saved.product),
          status: 'EXPIRED',
          createdAt: new Date().toISOString(),
        });
      } catch (e) { /* noop */ }

      return saved;
    }
    return bid;
  }

  async getBidsForProduct(productId: string): Promise<IBid[]> {
    return await this.Bid.find({
      product: productId,
      status: { $in: ['PENDING', 'ACCEPTED'] },
    })
      .populate('buyer', 'firstName lastName email')
      .sort({ createdAt: -1 });
  }

  async getBidById(bidId: string): Promise<IBid | null> {
    return await this.Bid.findById(bidId)
      .populate('buyer', 'firstName lastName email')
      .populate('seller', 'name')
      .populate('product', 'name images price');
  }

  async getUserBids(userId: string, status?: string, page: number = 1, limit: number = 10)
  : Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }> {
    const filter: any = { buyer: userId };
    if (status) filter.status = status.toUpperCase();

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

  async getSellerBids(sellerId: string, status?: string, page: number = 1, limit: number = 10)
  : Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }> {
    const filter: any = { seller: sellerId };
    if (status) filter.status = status.toUpperCase();

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

  async markBidAsConverted(bidId: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);
    if (!bid) throw new AppError('Bid not found', 404);

    (bid as any).convertedToCart = true;
    (bid as any).convertedAt = new Date();
    const saved = await bid.save();

    // [SSE] notify buyer
    try {
      const buyer = (saved.buyer as any)?.toString?.() || saved.buyer;
      streamController.publishToUser(String(buyer), 'bid:update', {
        bidId: String(saved._id),
        productId: String(saved.product),
        status: 'CONVERTED',
        createdAt: new Date().toISOString(),
      });
    } catch (e) { /* noop */ }

    return saved;
  }

  // ===== Admin methods (unchanged) =====

  async getAllBidsForAdmin(filters: any, page: number, limit: number, search?: string)
  : Promise<{ bids: IBid[]; total: number; page: number; totalPages: number }> {
    const query: any = { ...filters };

    if (search) {
      const searchProducts = await this.Product.find({ name: { $regex: search, $options: 'i' } }).select('_id');
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

  async getBidStatistics(): Promise<any> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalBids, pendingBids, acceptedBids, rejectedBids,
      todayBids, weekBids, monthBids,
      avgBidPrice, topProducts, totalProducts
    ] = await Promise.all([
      this.Bid.countDocuments(),
      this.Bid.countDocuments({ status: 'PENDING' }),
      this.Bid.countDocuments({ status: 'ACCEPTED' }),
      this.Bid.countDocuments({ status: 'REJECTED' }),
      this.Bid.countDocuments({ createdAt: { $gte: startOfDay } }),
      this.Bid.countDocuments({ createdAt: { $gte: startOfWeek } }),
      this.Bid.countDocuments({ createdAt: { $gte: startOfMonth } }),
      this.Bid.aggregate([{ $group: { _id: null, avg: { $avg: '$bidPrice' } } }]),
      this.Bid.aggregate([
        { $group: { _id: '$product', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $project: { productName: '$product.name', bidCount: '$count' } }
      ]),
      this.Bid.aggregate([{ $group: { _id: '$product' } }, { $count: 'totalProducts' }])
    ]);

    return {
      totalProducts: totalProducts[0]?.totalProducts || 0,
      totalBids, pendingBids, acceptedBids, rejectedBids,
      todayBids, weekBids, monthBids,
      avgBidPrice: avgBidPrice[0]?.avg || 0,
      topProducts,
      acceptanceRate: totalBids > 0 ? ((acceptedBids / totalBids) * 100).toFixed(2) : 0
    };
  }

  async forceAcceptBid(bidId: string, reason?: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);
    if (!bid) throw new AppError('Bid not found', 404);
    if (bid.status === 'ACCEPTED') throw new AppError('Bid is already accepted', 400);

    const expiresAt = new Date(); expiresAt.setHours(expiresAt.getHours() + 24);
    bid.status = 'ACCEPTED';
    bid.expiresAt = expiresAt;
    (bid as any).adminOverride = true;
    (bid as any).adminReason = reason;
    const saved = await bid.save();

    // [SSE] notify buyer
    try {
      const buyer = (saved.buyer as any)?.toString?.() || saved.buyer;
      streamController.publishToUser(String(buyer), 'bid:update', {
        bidId: String(saved._id),
        productId: String(saved.product),
        status: 'ACCEPTED',
        createdAt: new Date().toISOString(),
      });
    } catch (e) { /* noop */ }

    return saved;
  }

  async forceRejectBid(bidId: string, reason?: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);
    if (!bid) throw new AppError('Bid not found', 404);
    if (bid.status === 'REJECTED') throw new AppError('Bid is already rejected', 400);

    bid.status = 'REJECTED';
    (bid as any).adminOverride = true;
    (bid as any).adminReason = reason;
    const saved = await bid.save();

    // [SSE] notify buyer
    try {
      const buyer = (saved.buyer as any)?.toString?.() || saved.buyer;
      streamController.publishToUser(String(buyer), 'bid:update', {
        bidId: String(saved._id),
        productId: String(saved.product),
        status: 'REJECTED',
        createdAt: new Date().toISOString(),
      });
    } catch (e) { /* noop */ }

    return saved;
  }

  async cancelBid(bidId: string, reason: string): Promise<IBid> {
    const bid = await this.Bid.findById(bidId);
    if (!bid) throw new AppError('Bid not found', 404);

    bid.status = 'CANCELLED';
    (bid as any).cancelledBy = 'ADMIN';
    (bid as any).cancellationReason = reason;
    (bid as any).cancelledAt = new Date();
    const saved = await bid.save();

    // [SSE] notify buyer
    try {
      const buyer = (saved.buyer as any)?.toString?.() || saved.buyer;
      streamController.publishToUser(String(buyer), 'bid:update', {
        bidId: String(saved._id),
        productId: String(saved.product),
        status: 'CANCELLED',
        createdAt: new Date().toISOString(),
      });
    } catch (e) { /* noop */ }

    return saved;
  }

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
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
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
            _id: { year: { $year: '$createdAt' }, week: { $week: '$createdAt' } },
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
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
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

  async getProductsWithBids(filters: any, page: number, limit: number)
  : Promise<{ products: any[]; total: number; page: number; totalPages: number }> {
    const { search } = filters;
    const pipeline: any[] = [
      { $lookup: { from: 'bids', localField: '_id', foreignField: 'product', as: 'bids' } },
      { $match: { 'bids.0': { $exists: true } } },
      { $lookup: { from: 'sellers', localField: 'owner', foreignField: '_id', as: 'seller' } },
      { $unwind: '$seller' },
      { $lookup: { from: 'users', localField: 'seller.user', foreignField: '_id', as: 'sellerUser' } },
      { $unwind: '$sellerUser' },
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
      {
        $addFields: {
          bidCount: { $size: '$bids' },
          pendingBids: { $size: { $filter: { input: '$bids', cond: { $eq: ['$$this.status', 'PENDING'] } } } },
          acceptedBids: { $size: { $filter: { input: '$bids', cond: { $eq: ['$$this.status', 'ACCEPTED'] } } } },
          highestBid: { $max: '$bids.bidPrice' },
          lowestBid: { $min: '$bids.bidPrice' },
          avgBidPrice: { $avg: '$bids.bidPrice' },
          latestBidDate: { $max: '$bids.createdAt' }
        }
      },
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
      { $sort: { latestBidDate: -1 } }
    ];

    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await this.Product.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    const skip = (page - 1) * limit;
    pipeline.push({ $skip: skip }, { $limit: limit });

    const products = await this.Product.aggregate(pipeline);
    return { products, total, page, totalPages };
  }

  async getProductBidsForAdmin(productId: string): Promise<any> {
    const product = await this.Product.findById(productId).populate('owner', 'firstName lastName email');
    if (!product) throw new AppError('Product not found', 404);

    const bids = await this.Bid.find({ product: productId })
      .populate('buyer', 'firstName lastName email')
      .sort({ createdAt: -1 });

    const totalBids = bids.length;
    const pendingBids = bids.filter(b => b.status === 'PENDING').length;
    const acceptedBids = bids.filter(b => b.status === 'ACCEPTED').length;
    const rejectedBids = bids.filter(b => b.status === 'REJECTED').length;
    const bidPrices = bids.map(b => b.bidPrice);
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

  async getDebugBidCounts(): Promise<any> {
    const totalBids = await this.Bid.countDocuments();
    const totalProducts = await this.Product.countDocuments();
    const totalUsers = await this.User.countDocuments();
    const sampleBids = await this.Bid.find().limit(5).populate('product', 'name').populate('buyer', 'firstName lastName');
    const productsWithBids = await this.Bid.distinct('product');
    const step1 = await this.Product.aggregate([
      { $lookup: { from: 'bids', localField: '_id', foreignField: 'product', as: 'bids' } },
      { $limit: 5 }
    ]);
    const step2 = await this.Product.aggregate([
      { $lookup: { from: 'bids', localField: '_id', foreignField: 'product', as: 'bids' } },
      { $match: { 'bids.0': { $exists: true } } },
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
