import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPut,
  httpPost,
  requestParam,
  requestBody,
  response,
} from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IUserService } from '../services';
import { IUser } from '../models/User';

@controller('/api/v1/user')
export class UserController extends BaseController {
  constructor(@inject(TYPES.UserService) private userService: IUserService) {
    super();
  }

  // Get user profile
  @httpGet('/:userId/profile')
  public async getUserProfile(
    @requestParam('userId') userId: string,
    @response() res: Response
  ) {
    try {
      const userProfile = await this.userService.getUserProfile(userId);
      return this.sendResponse(res, 200, 'User profile fetched successfully', userProfile);
    } catch (error) {
      return this.sendResponse(res, 404, 'Unable to fetch user profile');
    }
  }

  // Update user profile
  @httpPut('/:userId/profile')
  public async updateUserProfile(
    @requestParam('userId') userId: string,
    @requestBody() payload: Partial<IUser>,
    @response() res: Response
  ) {
    try {
      const updatedProfile = await this.userService.updateUserProfile(userId, payload);
      return this.sendResponse(res, 200, 'User profile updated successfully', updatedProfile);
    } catch (error) {
      return this.sendResponse(res, 404, 'Unable to update user profile');
    }
  }

  // Get all users
  @httpGet('/')
  public async getAllUsers(@response() res: Response) {
    try {
      const users = await this.userService.getAllUsers();
      return this.sendResponse(res, 200, 'Users retrieved successfully', users);
    } catch (error) {
      return this.sendResponse(res, 500, 'Unable to retrieve users');
    }
  }

  // Get wishlist
  @httpGet('/:userId/wishlist')
  public async getWishlist(
    @requestParam('userId') userId: string,
    @response() res: Response
  ) {
    try {
      const wishlist = await this.userService.getWishlist(userId);
      return this.sendResponse(res, 200, 'Wishlist fetched successfully', wishlist);
    } catch (error) {
      return this.sendResponse(res, 404, 'Unable to fetch wishlist');
    }
  }

  // Add item to wishlist
  @httpPost('/:userId/wishlist/add')
  public async addToWishlist(
    @requestParam('userId') userId: string,
    @requestBody() { productId }: { productId: any },
    @response() res: Response
  ) {
    try {
      const updatedUser = await this.userService.addToWishlist(userId, productId);
      return this.sendResponse(res, 200, 'Item added to wishlist successfully', updatedUser);
    } catch (error) {
      return this.sendResponse(res, 404, 'Unable to add item to wishlist');
    }
  }

  // Remove item from wishlist
  @httpPost('/:userId/wishlist/remove')
  public async removeFromWishlist(
    @requestParam('userId') userId: string,
    @requestBody() { productId }: { productId: any },
    @response() res: Response
  ) {
    try {
      const updatedUser = await this.userService.removeFromWishlist(userId, productId);
      return this.sendResponse(res, 200, 'Item removed from wishlist successfully', updatedUser);
    } catch (error) {
      return this.sendResponse(res, 404, 'Unable to remove item from wishlist');
    }
  }
}
