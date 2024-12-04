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

    // Check price range
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

    return await newBid.save();
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
      .populate('buyer', 'name email')
      .sort({ createdAt: -1 });
  }
}
