import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IUserView, IUser, IProduct } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';

export interface IViewTrackingService {
  trackProductView(userId: string, productId: string, sessionId?: string): Promise<void>;
  getUserLastViews(userId: string, limit?: number): Promise<IUserView[]>;
  getProductViewCount(productId: string): Promise<number>;
  getUserViewsForProduct(userId: string, productId: string): Promise<IUserView | null>;
}

@injectable()
export class ViewTrackingService extends BaseService implements IViewTrackingService {
  constructor(
    @inject(TYPES.UserView) private UserView: Model<IUserView>,
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Product) private Product: Model<IProduct>
  ) {
    super();
  }

  async trackProductView(userId: string, productId: string, sessionId?: string): Promise<void> {
    // Verify user and product exist
    await this.verifyUser(userId);
    await this.verifyProduct(productId);

    try {
      // Try to find existing view record for this user-product combination
      const existingView = await this.UserView.findOne({ user: userId, product: productId });

      if (existingView) {
        // Update existing view - increment count and update timestamp
        existingView.viewCount += 1;
        existingView.viewedAt = new Date();
        if (sessionId) {
          existingView.sessionId = sessionId;
        }
        await existingView.save();
      } else {
        // Create new view record
        await this.UserView.create({
          user: userId,
          product: productId,
          viewedAt: new Date(),
          viewCount: 1,
          sessionId: sessionId || undefined,
        });
      }
    } catch (error: any) {
      // Handle duplicate key error (race condition)
      if (error.code === 11000) {
        // If duplicate key error, try to update existing record
        await this.UserView.findOneAndUpdate(
          { user: userId, product: productId },
          { 
            $inc: { viewCount: 1 },
            $set: { 
              viewedAt: new Date(),
              ...(sessionId && { sessionId })
            }
          }
        );
      } else {
        throw error;
      }
    }
  }

  async getUserLastViews(userId: string, limit: number = 20): Promise<IUserView[]> {
    await this.verifyUser(userId);

    const views = await this.UserView.find({ user: userId })
      .populate({
        path: 'product',
        select: 'name images price originalPrice productType condition variants brand description'
      })
      .sort({ viewedAt: -1 })
      .limit(limit)
      .lean();

    return views;
  }

  async getProductViewCount(productId: string): Promise<number> {
    await this.verifyProduct(productId);

    const totalViews = await this.UserView.aggregate([
      { $match: { product: productId } },
      { $group: { _id: null, totalViews: { $sum: '$viewCount' } } }
    ]);

    return totalViews.length > 0 ? totalViews[0].totalViews : 0;
  }

  async getUserViewsForProduct(userId: string, productId: string): Promise<IUserView | null> {
    await this.verifyUser(userId);
    await this.verifyProduct(productId);

    const view = await this.UserView.findOne({ user: userId, product: productId })
      .populate('product', 'name images price productType');

    return view;
  }

  // Private helper methods
  private async verifyUser(userId: string): Promise<IUser> {
    const user = await this.User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  }

  private async verifyProduct(productId: string): Promise<IProduct> {
    const product = await this.Product.findById(productId);
    if (!product) {
      throw new AppError('Product not found', 404);
    }
    return product;
  }
}