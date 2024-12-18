import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPut,
  httpPost,
  requestParam,
  requestBody,
  response,
  httpDelete,
} from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IAddressService, IUserService } from '../services';
import { IUser } from '../models/User';
import { addressDTO } from '../utils/dtos';

@controller('/api/v1/user')
export class UserController extends BaseController {
  constructor(
    @inject(TYPES.UserService) private userService: IUserService,
    @inject(TYPES.AddressService) private addressService: IAddressService
  ) {
    super();
  }

  // Get user profile
  @httpGet('/:userId/profile')
  public async getUserProfile(@requestParam('userId') userId: string, @response() res: Response) {
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

  // Get users wishlist
  @httpGet('/wishlist', TYPES.RequireSignIn)
  public async getWishlist(@response() res: Response) {
    try {
      const wishlist = await this.userService.getWishlist(res.locals.user);
      return this.sendResponse(res, 200, 'Wishlist fetched successfully', wishlist);
    } catch (error) {
      return this.sendResponse(res, 404, 'Unable to fetch wishlist');
    }
  }

  // Add item to wishlist
  @httpPost('/wishlist', TYPES.RequireSignIn)
  public async addToWishlist(@requestBody() { productId }: { productId: string }, @response() res: Response) {
    try {
      const updatedUser = await this.userService.addToWishlist(res.locals.user, productId);
      return this.sendResponse(res, 200, 'Item added to wishlist successfully', updatedUser);
    } catch (error) {
      return this.sendResponse(res, 404, 'Unable to add item to wishlist');
    }
  }

  // Remove item from wishlist
  @httpDelete('/wishlist/:productId', TYPES.RequireSignIn)
  public async removeFromWishlist(@requestParam('productId') productId: string, @response() res: Response) {
    try {
      const updatedUser = await this.userService.removeFromWishlist(res.locals.user, productId);
      return this.sendResponse(res, 200, 'Item removed from wishlist successfully', updatedUser);
    } catch (error) {
      return this.sendResponse(res, 404, 'Unable to remove item from wishlist');
    }
  }

  //get users address
  @httpGet('/address', TYPES.RequireSignIn)
  public async getUserAddress(@response() res: Response) {
    const userID = res.locals.user;
    try {
      const address = await this.addressService.findAddressesByUser(userID);
      return this.sendResponse(res, 200, 'Address fetched successfully', address);
    } catch (error) {
      return this.sendResponse(res, 404, 'Unable to fetch address');
    }
  }

  //add address
  @httpPost('/address', TYPES.RequireSignIn)
  public async addAddress(@requestBody() payload: addressDTO, @response() res: Response) {
    payload.user = res.locals.user;
    try {
      const newAddress = await this.addressService.addAddress(payload);
      return this.sendResponse(res, 201, 'Address added successfully', newAddress);
    } catch (error) {
      return this.sendResponse(res, 404, 'Unable to add address');
    }
  }

  //update address
  @httpPut('/address/:id', TYPES.RequireSignIn)
  public async updateAddress(
    @requestParam('id') id: string,
    @requestBody() payload: addressDTO,
    @response() res: Response
  ) {
    payload.user = res.locals.user;
    try {
      const updatedAddress = await this.addressService.updateAddress(payload, id);
      return this.sendResponse(res, 200, 'Address updated successfully', updatedAddress);
    } catch (error) {
      console.log(error);
      return this.sendResponse(res, 404, 'Unable to update address');
    }
  }
}
