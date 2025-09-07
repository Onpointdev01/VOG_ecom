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
  httpPatch,
  queryParam,
} from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IAddressService, IUserService, IViewTrackingService } from '../services';
import { IUser } from '../models/User';
import { addressDTO } from '../utils/dtos';
import { mapUserProfile } from '../utils/helpers';

@controller('/api/v1/user')
export class UserController extends BaseController {
  constructor(
    @inject(TYPES.UserService) private userService: IUserService,
    @inject(TYPES.AddressService) private addressService: IAddressService,
    @inject(TYPES.ViewTrackingService) private viewTrackingService: IViewTrackingService
  ) {
    super();
  }

  // Get user profile
  @httpGet('/profile', TYPES.RequireSignIn)
  public async getUserProfile(@response() res: Response) {
    try {
      const userProfile = await this.userService.getUserProfile(res.locals.user);
      const filteredProfile = mapUserProfile(userProfile);
      return this.sendResponse(res, 200, 'User profile fetched successfully', filteredProfile);
    } catch (error) {
      return this.sendResponse(res, 404, 'Unable to fetch user profile');
    }
  }

  @httpPatch('/profile/type', TYPES.RequireSignIn)
public async setAccountType(
  @requestBody() body: { type: 'buyer' | 'seller' },
  @response() res: Response
) {
  try {
    const type = (body?.type || '').toLowerCase();
    if (type !== 'buyer' && type !== 'seller') {
      return this.sendResponse(res, 400, 'Invalid type (must be "buyer" or "seller")');
    }

    // Service can whitelist updates + optionally create a Seller doc if needed
    const payload: Partial<IUser> =
      type === 'seller'
        ? { role: 'seller', isSeller: true, userType: 'seller' }
        : { role: 'buyer', isSeller: false, userType: 'buyer' };

    const updated = await this.userService.updateUserProfile(res.locals.user, payload);

    const filtered = mapUserProfile(updated);
    const withAccountType = {
      ...filtered,
      role: (updated as any)?.role,
      isSeller: (updated as any)?.isSeller,
      userType: (updated as any)?.userType,
      seller: (updated as any)?.seller,
    };

    return this.sendResponse(res, 200, 'Account type updated', withAccountType);
  } catch (err) {
    return this.sendResponse(res, 500, 'Unable to update account type');
  }
}

  // Update user profile
  @httpPatch('/profile', TYPES.RequireSignIn)
  public async updateUserProfile(@requestBody() payload: Partial<IUser>, @response() res: Response) {
    try {
      const updatedProfile = await this.userService.updateUserProfile(res.locals.user, payload);
      const filteredProfile = mapUserProfile(updatedProfile);
      return this.sendResponse(res, 200, 'User profile updated successfully', filteredProfile);
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
      await this.userService.removeFromWishlist(res.locals.user, productId);
      return this.sendResponse(res, 204, '');
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

  // Get user's last viewed products
  @httpGet('/last-views', TYPES.RequireSignIn)
  public async getUserLastViews(@response() res: Response, @queryParam('limit') limit?: string) {
    try {
      const userId = res.locals.user;
      const limitNumber = limit ? parseInt(limit, 10) : 20;
      const views = await this.viewTrackingService.getUserLastViews(userId, limitNumber);
      return this.sendResponse(res, 200, 'Last viewed products retrieved successfully', views);
    } catch (error) {
      console.error('Error fetching last viewed products:', error);
      return this.sendResponse(res, 404, 'Unable to fetch last viewed products');
    }
  }
}
