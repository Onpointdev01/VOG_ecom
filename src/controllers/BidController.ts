/**
 * @deprecated Legacy bid routes — use /api/v1/conversations and /api/v1/offers instead.
 */
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
import { BaseController } from './BaseController';
import TYPES from '../di';
import { IUser } from '../models';
import { IOfferService } from '../services/OfferService';
import { IConversationService } from '../services/ConversationService';
import { IMessageService } from '../services/MessageService';
import { toIdString } from '../utils/mongoId';

@controller('/api/v1/bids')
export class BidController extends BaseController {
  constructor(
    @inject(TYPES.OfferService) private offerService: IOfferService,
    @inject(TYPES.ConversationService) private conversationService: IConversationService,
    @inject(TYPES.MessageService) private messageService: IMessageService
  ) {
    super();
  }

  private deprecation(res: Response) {
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader(
      'X-API-Deprecation-Notice',
      'Bid endpoints are deprecated. Use /api/v1/conversations and /api/v1/offers.'
    );
  }

  @httpPut('/:bidId/accept', TYPES.RequireSignIn, TYPES.RequireSeller)
  async acceptBid(
    @response() res: Response,
    @request() req: Request,
    @requestParam('bidId') bidId: string
  ) {
    this.deprecation(res);
    const user = req.user as IUser;
    const offer = await this.offerService.acceptOffer(
      bidId,
      (user._id as string).toString()
    );
    return this.sendResponse(res, 200, 'Bid accepted successfully (deprecated)', {
      bid: offer,
      offer,
      addToCartLink: `/api/v1/offers/${bidId}/add-to-cart`,
      expiresAt: offer.expiresAt,
    });
  }

  @httpPut('/:bidId/reject', TYPES.RequireSignIn, TYPES.RequireSeller)
  async rejectBid(
    @response() res: Response,
    @request() req: Request,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { reason?: string }
  ) {
    this.deprecation(res);
    const user = req.user as IUser;
    const offer = await this.offerService.rejectOffer(
      bidId,
      (user._id as string).toString(),
      payload.reason
    );
    return this.sendResponse(res, 200, 'Bid rejected successfully (deprecated)', offer);
  }

  @httpPost('/:bidId/add-to-cart', TYPES.RequireSignIn)
  async addAcceptedBidToCart(
    @response() res: Response,
    @request() req: Request,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { size?: string; color?: string }
  ) {
    this.deprecation(res);
    const user = req.user as IUser;
    const cart = await this.offerService.addAcceptedOfferToCart(
      bidId,
      (user._id as string).toString(),
      payload.size || '',
      payload.color || ''
    );
    return this.sendResponse(res, 200, 'Product added to cart successfully (deprecated)', cart);
  }

  @httpGet('/my-bids', TYPES.RequireSignIn)
  async getMyBids(
    @response() res: Response,
    @request() req: Request,
    @queryParam('status') status?: string,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string
  ) {
    this.deprecation(res);
    const user = req.user as IUser;
    const result = await this.offerService.getBuyerOffers(
      (user._id as string).toString(),
      status,
      parseInt(page || '1', 10),
      parseInt(limit || '10', 10)
    );
    return this.sendResponse(res, 200, 'Bids retrieved successfully (deprecated)', {
      ...result,
      bids: result.offers,
    });
  }

  @httpGet('/seller-bids', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getSellerBids(
    @response() res: Response,
    @request() req: Request,
    @queryParam('status') status?: string,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string
  ) {
    this.deprecation(res);
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Only sellers can view seller bids');
    }
    const result = await this.offerService.getSellerOffers(
      sellerId.toString(),
      status,
      parseInt(page || '1', 10),
      parseInt(limit || '10', 10)
    );
    return this.sendResponse(res, 200, 'Seller bids retrieved successfully (deprecated)', {
      ...result,
      bids: result.offers,
    });
  }

  @httpGet('/conversations', TYPES.RequireSignIn)
  async getConversations(@response() res: Response, @request() req: Request) {
    this.deprecation(res);
    const user = req.user as IUser;
    const conversations = await this.conversationService.getUserConversations(
      (user._id as string).toString()
    );
    return this.sendResponse(res, 200, 'Conversations retrieved successfully (deprecated)', conversations);
  }

  @httpGet('/messages', TYPES.RequireSignIn)
  async getBidMessages(
    @response() res: Response,
    @request() req: Request,
    @queryParam('productId') productId?: string,
    @queryParam('conversationId') conversationId?: string
  ) {
    this.deprecation(res);
    const user = req.user as IUser;
    const userId = (user._id as string).toString();

    if (conversationId) {
      const messages = await this.messageService.getMessagesForConversation(
        conversationId,
        userId
      );
      return this.sendResponse(res, 200, 'Messages retrieved successfully (deprecated)', messages);
    }

    if (!productId) {
      return this.sendResponse(res, 400, 'productId or conversationId is required');
    }

    const { sellerUserId } = await this.conversationService.resolveSellerContext(productId);
    const conversation = await this.conversationService.createOrGetConversation(
      productId,
      userId
    );
    const messages = await this.messageService.getMessagesForConversation(
      toIdString(conversation),
      userId
    );
    return this.sendResponse(res, 200, 'Messages retrieved successfully (deprecated)', {
      messages,
      conversationId: toIdString(conversation),
      sellerUserId,
    });
  }

  @httpGet('/:bidId', TYPES.RequireSignIn)
  async getBidDetails(@response() res: Response, @requestParam('bidId') bidId: string) {
    this.deprecation(res);
    const offer = await this.offerService.getOfferById(bidId);
    if (!offer) {
      return this.sendResponse(res, 404, 'Bid not found');
    }
    return this.sendResponse(res, 200, 'Bid details retrieved successfully (deprecated)', offer);
  }
}

/** @deprecated Alias for seller portal */
@controller('/api/v1/seller')
export class SellerBidAliasController extends BaseController {
  constructor(@inject(TYPES.OfferService) private offerService: IOfferService) {
    super();
  }

  @httpGet('/bids', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getSellerBids(
    @response() res: Response,
    @request() req: Request,
    @queryParam('status') status?: string,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string
  ) {
    res.setHeader('X-API-Deprecated', 'true');
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Only sellers can view bids');
    }
    const result = await this.offerService.getSellerOffers(
      sellerId.toString(),
      status,
      parseInt(page || '1', 10),
      parseInt(limit || '10', 10)
    );
    return this.sendResponse(res, 200, 'Seller bids retrieved successfully', {
      ...result,
      bids: result.offers,
    });
  }
}
