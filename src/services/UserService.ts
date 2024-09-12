import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IUser } from '../models/User';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';

export interface IUserService {
  getUserProfile(userId: string): Promise<IUser>;
  updateUserProfile(userId: string, payload: Partial<IUser>): Promise<IUser>;
  addToWishlist(userId: string, productId: any): Promise<IUser>;
  getWishlist(userId: string): Promise<IUser['wishlist']>;
  removeFromWishlist(userId: string, productId: any): Promise<IUser>;
}

@injectable()
export class UserService extends BaseService implements IUserService {
  constructor(@inject(TYPES.User) private User: Model<IUser>) {
    super();
  }

  async getUserProfile(userId: string): Promise<IUser> {
    const user = await this.User.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  async updateUserProfile(userId: string, payload: Partial<IUser>): Promise<IUser> {
    const updatedUser = await this.User.findByIdAndUpdate(userId, payload, { new: true });
    if (!updatedUser) throw new AppError('User not found', 404);
    return updatedUser;
  }

  async addToWishlist(userId: string, productId: any): Promise<IUser> {
    const user = await this.User.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (!user.wishlist.includes(productId)) {
      user.wishlist.push(productId);
      await user.save();
    }

    return user;
  }

  async getWishlist(userId: string): Promise<IUser['wishlist']> {
    const user = await this.User.findById(userId).populate('wishlist');
    if (!user) throw new AppError('User not found', 404);
    return user.wishlist;
  }

  async removeFromWishlist(userId: string, productId: any): Promise<IUser> {
    const user = await this.User.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    user.wishlist = user.wishlist.filter(
      (wishlistItem) => wishlistItem.toString() !== productId.toString()
    );
    await user.save();

    return user;
  }
}
