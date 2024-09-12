import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IUser } from '../models/User';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';

export interface IUserService {
  getUserProfile(userId: string): Promise<IUser>;
  updateUserProfile(userId: string, payload: Partial<IUser>): Promise<IUser>;
  getWishlist(userId: string): Promise<IUser['wishlist']>;
  addToWishlist(userId: string, productId: any): Promise<IUser>;
  removeFromWishlist(userId: string, productId: any): Promise<IUser>;
  createUser(userData: Partial<IUser>): Promise<IUser>;
  getAllUsers(): Promise<IUser[]>; // Add this line
}

@injectable()
export class UserService extends BaseService implements IUserService {
  constructor(@inject(TYPES.User) private User: Model<IUser>) {
    super();
  }

  async createUser(userData: Partial<IUser>): Promise<IUser> {
    try {
      const newUser = new this.User(userData);
      await newUser.save();
      return newUser;
    } catch (error) {
      throw new AppError('Error creating user', 400);
    }
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

  async getWishlist(userId: string): Promise<IUser['wishlist']> {
    const user = await this.User.findById(userId).populate('wishlist');
    if (!user) throw new AppError('User not found', 404);
    return user.wishlist;
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

  async removeFromWishlist(userId: string, productId: any): Promise<IUser> {
    const user = await this.User.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    user.wishlist = user.wishlist.filter(
      (wishlistItem) => wishlistItem.toString() !== productId.toString()
    );
    await user.save();

    return user;
  }

  async getAllUsers(): Promise<IUser[]> {
    try {
      const users = await this.User.find().exec();
      return users;
    } catch (error) {
      throw new AppError('Unable to fetch users', 500);
    }
  }
}
