import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IUser } from '../models/User';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import { IProduct } from '../models';
import { pickBy } from 'lodash';
import { nonUpdatableFields } from '../utils/helpers';

export interface IUserService {
  getUserProfile(userId: string): Promise<IUser>;
  updateUserProfile(userId: string, payload: Partial<IUser>): Promise<IUser>;
  getAllUsers(): Promise<IUser[]>;
  getWishlist(userId: string): Promise<IUser['wishlist']>;
  addToWishlist(userId: string, productId: any): Promise<IProduct>;
  removeFromWishlist(userId: string, productId: any): Promise<IProduct>;
}

@injectable()
export class UserService extends BaseService implements IUserService {
  constructor(@inject(TYPES.User) private User: Model<IUser>, @inject(TYPES.Product) private Product: Model<IProduct>) {
    super();
  }

  async getUserProfile(userId: string): Promise<IUser> {
    const user = await this.User.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  async updateUserProfile(userId: string, payload: Partial<IUser>): Promise<IUser> {
    // Remove undefined fields from the payload
    const filteredPayload = pickBy(payload, (value, key) => !nonUpdatableFields.includes(key));
    const updatedUser = await this.User.findByIdAndUpdate(userId, filteredPayload, { new: true });
    if (!updatedUser) throw new AppError('User not found', 404);
    return updatedUser;
  }

  async getAllUsers(): Promise<IUser[]> {
    try {
      const users = await this.User.find().exec();
      return users;
    } catch (error) {
      throw new AppError('Unable to fetch users', 500);
    }
  }

  async getWishlist(userId: string): Promise<IUser['wishlist']> {
    const user = await this.User.findById(userId).populate('wishlist');
    if (!user) throw new AppError('User not found', 404);
    return user.wishlist;
  }

  async addToWishlist(userId: string, productId: any): Promise<IProduct> {
    // Fetch the user
    const user = await this.User.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    // Check if the product is already in the wishlist
    if (!user.wishlist.includes(productId)) {
      user.wishlist.push(productId);
      await user.save();
    }

    // Fetch the product details to return
    const product = await this.Product.findById(productId);
    if (!product) throw new AppError('Product not found', 404);

    return product;
  }

  async removeFromWishlist(userId: string, productId: any): Promise<IProduct> {
    // Fetch the user
    const user = await this.User.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    // Ensure the product exists in the wishlist before proceeding
    if (!user.wishlist.includes(productId)) {
      throw new AppError('Product not found in wishlist', 404);
    }

    // Fetch the product details before removing it
    const product = await this.Product.findById(productId);
    if (!product) throw new AppError('Product not found', 404);

    // Remove the product from the wishlist
    user.wishlist = user.wishlist.filter((wishlistItem) => wishlistItem.toString() !== productId.toString());
    await user.save();

    // Return the removed product details
    return product;
  }
}
