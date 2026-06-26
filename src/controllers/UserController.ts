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
  request,
} from 'inversify-express-utils';
import { Request, Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IAddressService, IUserService, IViewTrackingService } from '../services';
import { NotificationService } from '../services/NotificationService';
import { IUser } from '../models/User';
import { addressDTO } from '../utils/dtos';
import { mapUserProfile } from '../utils/helpers';
import upload from '../utils/aws';

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

  // ──────────────────────────────── PROFILE PICTURE ──────────────────────────────
  @httpPut('/profile', TYPES.RequireSignIn, upload.single('profilePicture'))
  public async uploadProfilePicture(
    @request() req: Request,
    @response() res: Response
  ) {
    try {
      const userId = res.locals.user;
      const file = req.file as Express.MulterS3.File;

      if (!file) {
        return this.sendResponse(res, 400, 'No file uploaded');
      }

      // Get the S3 URL from the uploaded file
      const imageUrl = file.location;

      // Update user profile with new image URL
      const updatedProfile = await this.userService.updateProfilePicture(userId, imageUrl);
      const filteredProfile = mapUserProfile(updatedProfile);

      return this.sendResponse(res, 200, 'Profile picture uploaded successfully', filteredProfile);
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      const message = error instanceof Error ? error.message : 'Unable to upload profile picture';
      return this.sendResponse(res, 500, message);
    }
  }

  @httpDelete('/profile-picture', TYPES.RequireSignIn)
  public async removeProfilePicture(@response() res: Response) {
    try {
      const userId = res.locals.user;
      const updatedProfile = await this.userService.removeProfilePicture(userId);
      const filteredProfile = mapUserProfile(updatedProfile);

      return this.sendResponse(res, 200, 'Profile picture removed successfully', filteredProfile);
    } catch (error) {
      console.error('Error removing profile picture:', error);
      const message = error instanceof Error ? error.message : 'Unable to remove profile picture';
      return this.sendResponse(res, 500, message);
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

  // ──────────────────────────────── SET PASSWORD (social login users) ────────────
  @httpPut('/set-password', TYPES.RequireSignIn)
  public async setPassword(
    @requestBody() body: { newPassword: string },
    @response() res: Response
  ) {
    const { newPassword } = body;
    if (!newPassword?.trim()) {
      return this.sendResponse(res, 400, 'New password is required');
    }
    if (newPassword.length < 6) {
      return this.sendResponse(res, 400, 'Password must be at least 6 characters long');
    }
    try {
      await this.userService.setPassword(res.locals.user, newPassword);
      return this.sendResponse(res, 200, 'Password set successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to set password';
      return this.sendResponse(res, 400, message);
    }
  }

  // ──────────────────────────────── CHANGE PASSWORD ──────────────────────────────
  @httpPut('/change-password', TYPES.RequireSignIn)
  public async changePassword(
    @requestBody() body: { oldPassword: string; newPassword: string },
    @response() res: Response
  ) {
    const { oldPassword, newPassword } = body;
    if (!oldPassword?.trim() || !newPassword?.trim()) {
      return this.sendResponse(res, 400, 'Current password and new password are required');
    }
    if (newPassword.length < 6) {
      return this.sendResponse(res, 400, 'New password must be at least 6 characters long');
    }
    try {
      await this.userService.changePassword(res.locals.user, oldPassword, newPassword);
      return this.sendResponse(res, 200, 'Password changed successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to change password';
      const status = error instanceof Error && error.message.includes('incorrect') ? 401 : 400;
      return this.sendResponse(res, status, message);
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
    } catch (error) {
      console.error('Error fetching wishlist:', error);
      return this.sendResponse(res, 500, 'Unable to fetch wishlist');
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
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      const message = error instanceof Error ? error.message : 'Unable to add item to wishlist';
      const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      return this.sendResponse(res, status, message);
    }
  }

  @httpDelete('/wishlist/:productId', TYPES.RequireSignIn)
  public async removeFromWishlist(
    @requestParam('productId') productId: string,
    @response() res: Response
  ) {
    try {
      await this.userService.removeFromWishlist(res.locals.user, productId);
      return this.sendResponse(res, 200, 'Item removed from wishlist successfully');
    } catch (error) {
      console.error('Error removing from wishlist:', error);
      const message = error instanceof Error ? error.message : 'Unable to remove item from wishlist';
      const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      return this.sendResponse(res, status, message);
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

  // ──────────────────────────── TEST NOTIFICATION ────────────────────────────────
  @httpPost('/test-notification', TYPES.RequireSignIn)
  public async sendTestNotification(@response() res: Response) {
    try {
      const userId = res.locals.user;

      // Send a test notification
      await this.notificationService.sendPushNotification(
        userId,
        'Test Notification 🎉',
        'This is a test notification from VOG! Tap to open the app.',
        {
          type: 'test',
          timestamp: new Date().toISOString(),
        }
      );

      return this.sendResponse(res, 200, 'Test notification sent successfully');
    } catch (error) {
      console.error('Error sending test notification:', error);
      return this.sendResponse(res, 500, 'Unable to send test notification');
    }
  }
}
