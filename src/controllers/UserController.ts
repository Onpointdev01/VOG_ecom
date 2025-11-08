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
import { NotificationService } from '../services/NotificationService';
import { IUser } from '../models/User';
import { addressDTO } from '../utils/dtos';
import { mapUserProfile } from '../utils/helpers';

@controller('/api/v1/user')
export class UserController extends BaseController {
  constructor(
    @inject(TYPES.UserService) private userService: IUserService,
    @inject(TYPES.AddressService) private addressService: IAddressService,
    @inject(TYPES.ViewTrackingService) private viewTrackingService: IViewTrackingService,
    @inject(TYPES.NotificationService) private notificationService: NotificationService
  ) {
    super();
  }

  // ───────────────────────────────── GET PROFILE ─────────────────────────────────
  @httpGet('/profile', TYPES.RequireSignIn)
  public async getUserProfile(@response() res: Response) {
    try {
      const userProfile = await this.userService.getUserProfile(res.locals.user);
      const filteredProfile = mapUserProfile(userProfile);
      return this.sendResponse(res, 200, 'User profile fetched successfully', filteredProfile);
    } catch {
      return this.sendResponse(res, 404, 'Unable to fetch user profile');
    }
  }

  // ──────────────────────────────── UPDATE PROFILE (generic) ─────────────────────
  @httpPatch('/profile', TYPES.RequireSignIn)
  public async updateUserProfile(@requestBody() payload: Partial<IUser>, @response() res: Response) {
    try {
      const updatedProfile = await this.userService.updateUserProfile(res.locals.user, payload);
      const filteredProfile = mapUserProfile(updatedProfile);
      return this.sendResponse(res, 200, 'User profile updated successfully', filteredProfile);
    } catch {
      return this.sendResponse(res, 404, 'Unable to update user profile');
    }
  }

  // ──────────────────────────────── ACCOUNT TYPE SWITCHERS ───────────────────────
  // Dedicated body: { type: 'buyer' | 'seller' }
  @httpPatch('/profile/type', TYPES.RequireSignIn)
  public async setAccountType(
    @requestBody() body: { type: 'buyer' | 'seller' },
    @response() res: Response
  ) {
    try {
      const type = (body?.type || '').toLowerCase() as 'buyer' | 'seller';
      if (type !== 'buyer' && type !== 'seller') {
        return this.sendResponse(res, 400, 'Invalid type (must be "buyer" or "seller")');
      }

      const updated = await this.userService.setAccountType(res.locals.user, type);
      const filtered = mapUserProfile(updated);

      // Ensure role flags are present even if mapUserProfile strips some fields
      const withRole = {
        ...filtered,
        role: (updated as any)?.role,
        isSeller: (updated as any)?.isSeller,
        userType: (updated as any)?.userType,
        seller: (updated as any)?.seller,
      };

      return this.sendResponse(res, 200, 'Account type updated', withRole);
    } catch {
      return this.sendResponse(res, 500, 'Unable to update account type');
    }
  }

  // Friendly endpoints you can hit directly
  @httpPatch('/role/seller', TYPES.RequireSignIn)
  public async becomeSeller(@response() res: Response) {
    try {
      const updated = await this.userService.setAccountType(res.locals.user, 'seller');
      const filtered = mapUserProfile(updated);
      const withRole = {
        ...filtered,
        role: (updated as any)?.role,
        isSeller: (updated as any)?.isSeller,
        userType: (updated as any)?.userType,
        seller: (updated as any)?.seller,
      };
      return this.sendResponse(res, 200, 'User role updated to seller', withRole);
    } catch {
      return this.sendResponse(res, 500, 'Unable to update user role');
    }
  }

  @httpPatch('/role/buyer', TYPES.RequireSignIn)
  public async becomeBuyer(@response() res: Response) {
    try {
      const updated = await this.userService.setAccountType(res.locals.user, 'buyer');
      const filtered = mapUserProfile(updated);
      const withRole = {
        ...filtered,
        role: (updated as any)?.role,
        isSeller: (updated as any)?.isSeller,
        userType: (updated as any)?.userType,
        seller: (updated as any)?.seller,
      };
      return this.sendResponse(res, 200, 'User role updated to buyer', withRole);
    } catch {
      return this.sendResponse(res, 500, 'Unable to update user role');
    }
  }

  // Generic role endpoint: body { role: 'buyer'|'seller' }
  @httpPatch('/role', TYPES.RequireSignIn)
  public async setRole(
    @requestBody() body: { role?: 'buyer' | 'seller' },
    @response() res: Response
  ) {
    try {
      const role = (body?.role || '').toLowerCase() as 'buyer' | 'seller';
      if (role !== 'buyer' && role !== 'seller') {
        return this.sendResponse(res, 400, 'Invalid role');
      }
      const updated = await this.userService.setAccountType(res.locals.user, role);
      const filtered = mapUserProfile(updated);
      const withRole = {
        ...filtered,
        role: (updated as any)?.role,
        isSeller: (updated as any)?.isSeller,
        userType: (updated as any)?.userType,
        seller: (updated as any)?.seller,
      };
      return this.sendResponse(res, 200, `User role updated to ${role}`, withRole);
    } catch {
      return this.sendResponse(res, 500, 'Unable to update user role');
    }
  }

  // ─────────────────────────────────── USERS LIST ────────────────────────────────
  @httpGet('/')
  public async getAllUsers(@response() res: Response) {
    try {
      const users = await this.userService.getAllUsers();
      return this.sendResponse(res, 200, 'Users retrieved successfully', users);
    } catch {
      return this.sendResponse(res, 500, 'Unable to retrieve users');
    }
  }

  // ─────────────────────────────────── WISHLIST ──────────────────────────────────
  @httpGet('/wishlist', TYPES.RequireSignIn)
  public async getWishlist(@response() res: Response) {
    try {
      const wishlist = await this.userService.getWishlist(res.locals.user);
      return this.sendResponse(res, 200, 'Wishlist fetched successfully', wishlist);
    } catch {
      return this.sendResponse(res, 404, 'Unable to fetch wishlist');
    }
  }

  @httpPost('/wishlist', TYPES.RequireSignIn)
  public async addToWishlist(
    @requestBody() { productId }: { productId: string },
    @response() res: Response
  ) {
    try {
      const product = await this.userService.addToWishlist(res.locals.user, productId);
      return this.sendResponse(res, 200, 'Item added to wishlist successfully', product);
    } catch {
      return this.sendResponse(res, 404, 'Unable to add item to wishlist');
    }
  }

  @httpDelete('/wishlist/:productId', TYPES.RequireSignIn)
  public async removeFromWishlist(
    @requestParam('productId') productId: string,
    @response() res: Response
  ) {
    try {
      await this.userService.removeFromWishlist(res.locals.user, productId);
      return this.sendResponse(res, 204, '');
    } catch {
      return this.sendResponse(res, 404, 'Unable to remove item from wishlist');
    }
  }

  // ─────────────────────────────────── ADDRESSES ─────────────────────────────────
  @httpGet('/address', TYPES.RequireSignIn)
  public async getUserAddress(@response() res: Response) {
    const userID = res.locals.user;
    try {
      const address = await this.addressService.findAddressesByUser(userID);
      return this.sendResponse(res, 200, 'Address fetched successfully', address);
    } catch {
      return this.sendResponse(res, 404, 'Unable to fetch address');
    }
  }

  @httpPost('/address', TYPES.RequireSignIn)
  public async addAddress(@requestBody() payload: addressDTO, @response() res: Response) {
    payload.user = res.locals.user;
    try {
      const newAddress = await this.addressService.addAddress(payload);
      return this.sendResponse(res, 201, 'Address added successfully', newAddress);
    } catch {
      return this.sendResponse(res, 404, 'Unable to add address');
    }
  }

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
      // eslint-disable-next-line no-console
      console.log(error);
      return this.sendResponse(res, 404, 'Unable to update address');
    }
  }

  @httpDelete('/address/:id', TYPES.RequireSignIn)
  public async deleteAddress(
    @requestParam('id') id: string,
    @response() res: Response
  ) {
    try {
      await this.addressService.deleteAddress(id);
      return this.sendResponse(res, 200, 'Address deleted successfully');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(error);
      return this.sendResponse(res, 404, 'Unable to delete address');
    }
  }

  @httpPatch('/address/:id/default', TYPES.RequireSignIn)
  public async setDefaultAddress(
    @requestParam('id') id: string,
    @response() res: Response
  ) {
    const userID = res.locals.user;
    try {
      const updatedAddress = await this.addressService.setDefaultAddress(userID, id);
      return this.sendResponse(res, 200, 'Default address updated successfully', updatedAddress);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(error);
      return this.sendResponse(res, 404, 'Unable to set default address');
    }
  }

  // ────────────────────────────── LAST VIEWED PRODUCTS ───────────────────────────
  @httpGet('/last-views', TYPES.RequireSignIn)
  public async getUserLastViews(
    @response() res: Response,
    @queryParam('limit') limit?: string
  ) {
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

  // ──────────────────────────── PUSH NOTIFICATIONS ───────────────────────────────
  @httpPost('/push-token', TYPES.RequireSignIn)
  public async savePushToken(
    @requestBody() { token }: { token: string },
    @response() res: Response
  ) {
    try {
      const userId = res.locals.user;
      await this.notificationService.savePushToken(userId, token);
      return this.sendResponse(res, 200, 'Push token saved successfully');
    } catch (error) {
      console.error('Error saving push token:', error);
      return this.sendResponse(res, 400, 'Unable to save push token');
    }
  }

  @httpDelete('/push-token', TYPES.RequireSignIn)
  public async removePushToken(
    @requestBody() { token }: { token: string },
    @response() res: Response
  ) {
    try {
      const userId = res.locals.user;
      await this.notificationService.removePushToken(userId, token);
      return this.sendResponse(res, 200, 'Push token removed successfully');
    } catch (error) {
      console.error('Error removing push token:', error);
      return this.sendResponse(res, 400, 'Unable to remove push token');
    }
  }
}
