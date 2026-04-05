import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IReview, refreshSellerReviewMetrics } from '../models/Review';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';

export interface IReviewService {
  getAllReviews(): Promise<IReview[]>;
  getReviewsByProduct(productId: string): Promise<IReview[]>;
  getMySellerReview(sellerId: string, userId: string): Promise<IReview | null>;
  getReviewById(id: string): Promise<IReview>;
  createReview(payload: Partial<IReview>): Promise<IReview>;
  updateReview(id: string, payload: Partial<IReview>): Promise<IReview>;
  deleteReview(id: string): Promise<void>;
}

@injectable()
export class ReviewService extends BaseService implements IReviewService {
  constructor(@inject(TYPES.Review) private Review: Model<IReview>) {
    super();
  }

  async getAllReviews(): Promise<IReview[]> {
    return this.Review.find().populate('user', 'firstName lastName'); // Fetch first and last name
  }

  async getReviewById(id: string): Promise<IReview> {
    const review = await this.Review.findById(id).populate('user', 'firstName lastName'); // Fetch first and last name
    if (!review) throw new AppError('Review not found', 404);
    return review;
  }
  

  async createReview(payload: Partial<IReview>): Promise<IReview> {
    if (payload.reviewType === 'seller' && payload.seller && payload.user) {
      const existing = await this.Review.findOne({
        user: payload.user,
        seller: payload.seller,
        reviewType: 'seller',
      });
      let review: IReview;
      if (existing) {
        existing.rating = payload.rating as number;
        if (payload.comment !== undefined) {
          existing.comment = payload.comment as string;
        }
        await existing.save();
        review = existing;
      } else {
        review = (await this.Review.create(payload)) as IReview;
      }
      if (review.seller) {
        await refreshSellerReviewMetrics(review.seller as any);
      }
      return review;
    }
    return this.Review.create(payload) as Promise<IReview>;
  }

  async updateReview(id: string, payload: Partial<IReview>): Promise<IReview> {
    const updatedReview = await this.Review.findByIdAndUpdate(id, payload, { new: true });
    if (!updatedReview) throw new AppError('Review not found', 404);
    return updatedReview;
  }

  async deleteReview(id: string): Promise<void> {
    const result = await this.Review.findByIdAndDelete(id);
    if (!result) throw new AppError('Review not found', 404);
  }

  async getReviewsByProduct(productId: string): Promise<IReview[]> {
    return this.Review.find({ product: productId }).populate('user', 'firstName lastName'); // Fetch first and last name
  }

  async getMySellerReview(sellerId: string, userId: string): Promise<IReview | null> {
    const doc = await this.Review.findOne({
      seller: sellerId,
      user: userId,
      reviewType: 'seller',
    }).lean();
    return doc as IReview | null;
  }
}
