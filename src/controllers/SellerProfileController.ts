import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPut,
  request,
  requestBody,
  response,
} from 'inversify-express-utils';
import { Request, Response } from 'express';
import TYPES from '../di';
import { IUser } from '../models';
import { ISellerService } from '../services/SellerService';
import { BaseController } from './BaseController';
import AppError from '../utils/errors/AppError';

@controller('/api/v1/seller')
export class SellerProfileController extends BaseController {
  constructor(@inject(TYPES.SellerService) private sellerService: ISellerService) {
    super();
  }

  private getSellerId(req: Request): string {
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      throw new AppError('Seller account required', 403);
    }
    return sellerId.toString();
  }

  @httpGet('/stats', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getStats(@response() res: Response, @request() req: Request) {
    const sellerId = this.getSellerId(req);
    const stats = await this.sellerService.getSellerStats(sellerId);
    return this.sendResponse(res, 200, 'Seller stats retrieved successfully', stats);
  }

  @httpGet('/profile', TYPES.RequireSignIn)
  async getProfile(@response() res: Response, @request() req: Request) {
    const user = req.user as IUser;
    const userId = String(user._id);
    const profile = await this.sellerService.getProfileForUser(userId);
    return this.sendResponse(res, 200, 'Seller profile retrieved successfully', profile);
  }

  @httpPut('/profile', TYPES.RequireSignIn)
  async updateProfile(
    @response() res: Response,
    @request() req: Request,
    @requestBody()
    body: {
      name?: string;
      type?: string;
      logo?: string;
      official?: boolean;
    }
  ) {
    const user = req.user as IUser;
    const userId = String(user._id);
    const profile = await this.sellerService.updateProfileForUser(userId, {
      name: body.name,
      type: body.type as 'individual' | 'company' | undefined,
      logo: body.logo,
      official: body.official,
    });
    return this.sendResponse(res, 200, 'Seller profile updated successfully', profile);
  }
}
