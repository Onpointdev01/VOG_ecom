import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPost,
  httpPut,
  queryParam,
  request,
  requestBody,
  requestParam,
  response,
} from 'inversify-express-utils';
import { Request, Response } from 'express';
import joiMiddleware from '../middlewares/joiMiddleware';
import TYPES from '../di';
import { IUser } from '../models';
import { IOfferService } from '../services/OfferService';
import AppError from '../utils/errors/AppError';
import {
  acceptOfferSchema,
  addOfferToCartSchema,
  counterOfferSchema,
  createOfferSchema,
  offerIdParamSchema,
  rejectOfferSchema,
} from '../validators/offer.validators';
import { productIdParamSchema } from '../validators/conversation.validators';
import { BaseController } from './BaseController';

@controller('/api/v1')
export class OfferController extends BaseController {
  constructor(@inject(TYPES.OfferService) private offerService: IOfferService) {
    super();
  }

  @httpPost(
    '/products/:productId/offers',
    TYPES.RequireSignIn,
    joiMiddleware(productIdParamSchema, 'params'),
    joiMiddleware(createOfferSchema)
  )
  async createOffer(
    @response() res: Response,
    @request() req: Request,
    @requestParam('productId') productId: string,
    @requestBody() body: { amount: number; message?: string; quantity?: number; currency?: string }
  ) {
    const user = req.user as IUser;
    const result = await this.offerService.createOffer(
      productId,
      (user._id as string).toString(),
      body.amount,
      body.message,
      { quantity: body.quantity, currency: body.currency }
    );
    return this.sendResponse(res, 201, 'Offer created successfully', result);
  }

  @httpGet('/offers/my', TYPES.RequireSignIn)
  async getMyOffers(
    @response() res: Response,
    @request() req: Request,
    @queryParam('status') status?: string,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string
  ) {
    const user = req.user as IUser;
    const result = await this.offerService.getBuyerOffers(
      (user._id as string).toString(),
      status,
      parseInt(page || '1', 10),
      parseInt(limit || '10', 10)
    );
    return this.sendResponse(res, 200, 'Offers retrieved successfully', result);
  }

  @httpGet('/offers/seller', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getSellerOffers(
    @response() res: Response,
    @request() req: Request,
    @queryParam('status') status?: string,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string
  ) {
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Only sellers can view seller offers');
    }

    const result = await this.offerService.getSellerOffers(
      sellerId.toString(),
      status,
      parseInt(page || '1', 10),
      parseInt(limit || '10', 10)
    );
    return this.sendResponse(res, 200, 'Seller offers retrieved successfully', result);
  }

  @httpGet('/offers/seller/pending-count', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getSellerPendingOfferCount(@response() res: Response, @request() req: Request) {
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Only sellers can view seller offers');
    }

    const count = await this.offerService.countSellerPendingOffers(sellerId.toString());
    return this.sendResponse(res, 200, 'Pending offer count retrieved', { count });
  }

  @httpGet(
    '/offers/:offerId',
    TYPES.RequireSignIn,
    joiMiddleware(offerIdParamSchema, 'params')
  )
  async getOffer(
    @response() res: Response,
    @request() req: Request,
    @requestParam('offerId') offerId: string
  ) {
    const user = req.user as IUser;
    const offer = await this.offerService.getOfferForUser(
      offerId,
      (user._id as { toString(): string }).toString()
    );
    return this.sendResponse(res, 200, 'Offer retrieved successfully', offer);
  }

  @httpPut(
    '/offers/:offerId/counter',
    TYPES.RequireSignIn,
    TYPES.RequireSeller,
    joiMiddleware(offerIdParamSchema, 'params'),
    joiMiddleware(counterOfferSchema)
  )
  async counterOffer(
    @response() res: Response,
    @request() req: Request,
    @requestParam('offerId') offerId: string,
    @requestBody() body: { amount: number; message?: string; quantity?: number; currency?: string }
  ) {
    const user = req.user as IUser;
    const result = await this.offerService.counterOffer(
      offerId,
      (user._id as string).toString(),
      body.amount,
      body.message,
      { quantity: body.quantity, currency: body.currency }
    );
    return this.sendResponse(res, 200, 'Counter offer sent successfully', result);
  }

  @httpPut(
    '/offers/:offerId/accept',
    TYPES.RequireSignIn,
    joiMiddleware(offerIdParamSchema, 'params'),
    joiMiddleware(acceptOfferSchema)
  )
  async acceptOffer(
    @response() res: Response,
    @request() req: Request,
    @requestParam('offerId') offerId: string
  ) {
    const user = req.user as IUser;
    const userId = (user._id as string).toString();
    if (user.role === 'admin') {
      throw new AppError('Admins cannot participate in offer negotiations', 403);
    }

    const offer = await this.offerService.acceptOffer(offerId, userId);
    return this.sendResponse(res, 200, 'Offer accepted successfully', {
      offer,
      addToCartPath: `/api/v1/offers/${offerId}/add-to-cart`,
      expiresAt: offer.expiresAt,
    });
  }

  @httpPut(
    '/offers/:offerId/reject',
    TYPES.RequireSignIn,
    joiMiddleware(offerIdParamSchema, 'params'),
    joiMiddleware(rejectOfferSchema)
  )
  async rejectOffer(
    @response() res: Response,
    @request() req: Request,
    @requestParam('offerId') offerId: string,
    @requestBody() body: { reason?: string }
  ) {
    const user = req.user as IUser;
    const userId = (user._id as string).toString();
    if (user.role === 'admin') {
      throw new AppError('Admins cannot participate in offer negotiations', 403);
    }

    const offer = await this.offerService.rejectOffer(offerId, userId, body.reason);
    return this.sendResponse(res, 200, 'Offer rejected successfully', offer);
  }

  @httpPost(
    '/offers/:offerId/add-to-cart',
    TYPES.RequireSignIn,
    joiMiddleware(offerIdParamSchema, 'params'),
    joiMiddleware(addOfferToCartSchema)
  )
  async addToCart(
    @response() res: Response,
    @request() req: Request,
    @requestParam('offerId') offerId: string,
    @requestBody() body: { size?: string; color?: string }
  ) {
    const user = req.user as IUser;
    const cart = await this.offerService.addAcceptedOfferToCart(
      offerId,
      (user._id as string).toString(),
      body.size || '',
      body.color || ''
    );
    return this.sendResponse(res, 200, 'Offer added to cart successfully', cart);
  }
}
