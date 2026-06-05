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
  updateProfilePicture(userId: string, imageUrl: string): Promise<IUser>;
  removeProfilePicture(userId: string): Promise<IUser>;
  setAccountType(userId: string, type: 'buyer' | 'seller'): Promise<IUser>;
  getAllUsers(): Promise<IUser[]>;
  getWishlist(userId: string): Promise<IUser['wishlist']>;
  addToWishlist(userId: string, productId: any): Promise<IProduct>;
  removeFromWishlist(userId: string, productId: any): Promise<void>;
}

@injectable()
export class UserService extends BaseService implements IUserService {
  constructor(
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Product) private Product: Model<IProduct>
  ) {
    super();
  }

  async getUserProfile(userId: string): Promise<IUser> {
    const user = await this.User.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  async updateUserProfile(userId: string, payload: Partial<IUser>): Promise<IUser> {
    // Remove undefined values and block fields you never want updated here
    const filteredPayload = pickBy(
      payload,
      (value: unknown, key: string) => value !== undefined && !nonUpdatableFields.includes(key)
    );
    const updatedUser = await this.User.findByIdAndUpdate(userId, filteredPayload, { new: true });
    if (!updatedUser) throw new AppError('User not found', 404);
    return updatedUser;
  }

  async updateProfilePicture(userId: string, imageUrl: string): Promise<IUser> {
    const updatedUser = await this.User.findByIdAndUpdate(
      userId,
      { profileImageUrl: imageUrl },
      { new: true }
    );
    if (!updatedUser) throw new AppError('User not found', 404);
    return updatedUser;
  }

  async removeProfilePicture(userId: string): Promise<IUser> {
    const user = await this.User.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    // Generate default avatar using ui-avatars.com
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    const name = `${firstName}+${lastName}`;
    const defaultAvatar = `https://ui-avatars.com/api/?background=random&name=${name}`;

    const updatedUser = await this.User.findByIdAndUpdate(
      userId,
      { profileImageUrl: defaultAvatar },
      { new: true }
    );
    if (!updatedUser) throw new AppError('User not found', 404);
    return updatedUser;
  }

  // Explicit role switch with consistent flags
  async setAccountType(userId: string, type: 'buyer' | 'seller'): Promise<IUser> {
    const t = (type || '').toLowerCase();
    if (t !== 'buyer' && t !== 'seller') {
      throw new AppError('Invalid type (must be "buyer" or "seller")', 400);
    }

    const update: Partial<IUser> & Record<string, any> =
      t === 'seller'
        ? { role: 'seller', isSeller: true, userType: 'seller' }
        : { role: 'buyer', isSeller: false, userType: 'buyer' };

    const updated = await this.User.findByIdAndUpdate(userId, update, { new: true });
    if (!updated) throw new AppError('User not found', 404);

    // (Optional) If you later create a Seller entity, link/create it here.
    return updated;
  }

  async getAllUsers(): Promise<IUser[]> {
    try {
      return await this.User.find().exec();
    } catch {
      throw new AppError('Unable to fetch users', 500);
    }
  }

  async getWishlist(userId: string): Promise<IUser['wishlist']> {
    const user = await this.User.findById(userId).populate('wishlist');
    if (!user) throw new AppError('User not found', 404);
    return user.wishlist;
  }

  async addToWishlist(userId: string, productId: any): Promise<IProduct> {
    const user = await this.User.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    const isAlreadyInWishlist = user.wishlist.some(
      (item) => item.toString() === productId.toString()
    );
    if (!isAlreadyInWishlist) {
      user.wishlist.push(productId);
      await user.save();
    }

    const product = await this.Product.findById(productId);
    if (!product) throw new AppError('Product not found', 404);

    return product;
  }

  async removeFromWishlist(userId: string, productId: any): Promise<void> {
    const user = await this.User.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    const isInWishlist = user.wishlist.some(
      (item) => item.toString() === productId.toString()
    );
    if (!isInWishlist) throw new AppError('Product not found in wishlist', 404);

    user.wishlist = user.wishlist.filter(
      (wishlistItem) => wishlistItem.toString() !== productId.toString()
    );
    await user.save();
  }
}
