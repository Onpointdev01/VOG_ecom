import { inject } from 'inversify';
import {
  controller,
  httpPost,
  httpGet,
  httpPut,
  requestParam,
  requestBody,
  response,
  request,
  queryParam,
} from 'inversify-express-utils';
import { Response, Request } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IProductBidService, IBidMessageService, ICartService } from '../services';
import { IUser, IBid } from '../models';
// [SSE] add import
import { streamController } from '../realtime/streamController';

// Type guard to check if buyer is populated
function isPopulatedBuyer(buyer: any): buyer is IUser {
  return buyer && typeof buyer === 'object' && buyer._id;
}

// Helper to safely get buyer ID
function getBuyerId(bid: IBid): string {
  if (isPopulatedBuyer(bid.buyer)) {
    return (bid.buyer._id as string).toString();
  }
  if (bid.buyer) {
    return bid.buyer.toString();
  }
  throw new Error('Bid buyer is required');
}

@controller('/api/v1/bids')
export class BidController extends BaseController {
  constructor(
    @inject(TYPES.ProductBidService) private productBidService: IProductBidService,
    @inject(TYPES.BidMessageService) private bidMessageService: IBidMessageService,
    @inject(TYPES.CartService) private cartService: ICartService
  ) {
    super();
  }

  @httpPut('/:bidId/accept', TYPES.RequireSignIn, TYPES.RequireSeller)
  async acceptBid(
    @response() res: Response,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { message?: string }
  ) {
    const user = res.locals.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Only sellers can accept bids');
    }

    const acceptedBid = await this.productBidService.acceptBid(bidId, sellerId.toString());
    
    // Send notification message to buyer
    const buyerId = getBuyerId(acceptedBid);
      
    await this.bidMessageService.createBidAcceptedMessage(
      buyerId,
      sellerId.toString(),
      acceptedBid.product.toString(),
      bidId,
      payload.message || `Your bid of $${acceptedBid.bidPrice} has been accepted!`
    );

    // Generate add-to-cart link for the buyer
    const addToCartLink = `/api/v1/bids/${bidId}/add-to-cart`;

    // [SSE] lightweight generic notifications for both parties
    try {
      streamController.publishToMany([buyerId, sellerId.toString()], 'notification', {
        type: 'BID_ACCEPTED',
        bidId,
        productId: acceptedBid.product.toString(),
        message: payload.message || `Your bid of $${acceptedBid.bidPrice} has been accepted!`,
        addToCartLink,
        expiresAt: acceptedBid.expiresAt,
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}

    return this.sendResponse(res, 200, 'Bid accepted successfully', {
      bid: acceptedBid,
      addToCartLink,
      expiresAt: acceptedBid.expiresAt
    });
  }

  @httpPut('/:bidId/reject', TYPES.RequireSignIn, TYPES.RequireSeller)
  async rejectBid(
    @response() res: Response,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { reason?: string }
  ) {
    const user = res.locals.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Only sellers can reject bids');
    }

    const rejectedBid = await this.productBidService.rejectBid(bidId, sellerId.toString());
    
    // Send notification message to buyer
    const buyerId = getBuyerId(rejectedBid);
      
    await this.bidMessageService.createBidRejectedMessage(
      buyerId,
      sellerId.toString(),
      rejectedBid.product.toString(),
      bidId,
      payload.reason || 'Your bid has been rejected.'
    );

    // [SSE] lightweight generic notifications for both parties
    try {
      streamController.publishToMany([buyerId, sellerId.toString()], 'notification', {
        type: 'BID_REJECTED',
        bidId,
        productId: rejectedBid.product.toString(),
        message: payload.reason || 'Your bid has been rejected.',
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}

    return this.sendResponse(res, 200, 'Bid rejected successfully', rejectedBid);
  }

  @httpPost('/:bidId/add-to-cart', TYPES.RequireSignIn)
  async addAcceptedBidToCart(
    @response() res: Response,
    @request() req: Request,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { size: string; color: string }
  ) {
    const user = req.user as IUser;
    
    // Get the bid and verify it's accepted and belongs to the user
    const bid = await this.productBidService.getBidById(bidId);
    
    if (!bid) {
      return this.sendResponse(res, 404, 'Bid not found');
    }

    const bidBuyerId = getBuyerId(bid);
      
    if (bidBuyerId !== (user._id as string).toString()) {
      return this.sendResponse(res, 403, 'You can only add your own accepted bids to cart');
    }

    if (bid.status !== 'ACCEPTED') {
      return this.sendResponse(res, 400, 'Only accepted bids can be added to cart');
    }

    // Check if bid has expired
    if (bid.expiresAt && bid.expiresAt < new Date()) {
      return this.sendResponse(res, 400, 'This bid has expired');
    }

    // Add to cart with the bid price
    const cartItem = await this.cartService.addBidToCart(
      (user._id as string).toString(),
      bid.product.toString(),
      bid.bidPrice,
      payload.size,
      payload.color,
      bidId
    );

    // Mark bid as converted to cart
    await this.productBidService.markBidAsConverted(bidId);

    // [SSE] notify buyer & seller (lightweight)
    try {
      const sellerId = (bid.seller as any)?.toString?.() || bid.seller?.toString?.() || String(bid.seller);
      streamController.publishToMany([String(user._id), sellerId], 'notification', {
        type: 'BID_CONVERTED_TO_CART',
        bidId,
        productId: bid.product.toString(),
        cartItemId: (cartItem as any)?._id?.toString?.() || undefined,
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}

    return this.sendResponse(res, 200, 'Product added to cart successfully', cartItem);
  }

  @httpGet('/my-bids', TYPES.RequireSignIn)
  async getMyBids(
    @response() res: Response,
    @request() req: Request,
    @queryParam('status') status?: string,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string
  ) {
    const user = req.user as IUser;
    const pageNum = parseInt(page || '1');
    const limitNum = parseInt(limit || '10');
    
    const bids = await this.productBidService.getUserBids(
      (user._id as string).toString(),
      status,
      pageNum,
      limitNum
    );

    return this.sendResponse(res, 200, 'Bids retrieved successfully', bids);
  }

  @httpGet('/seller-bids', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getSellerBids(
    @response() res: Response,
    @request() req: Request,
    @queryParam('status') status?: string,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string
  ) {
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Only sellers can view seller bids');
    }

    const pageNum = parseInt(page || '1');
    const limitNum = parseInt(limit || '10');
    
    const bids = await this.productBidService.getSellerBids(
      sellerId.toString(),
      status,
      pageNum,
      limitNum
    );

    return this.sendResponse(res, 200, 'Seller bids retrieved successfully', bids);
  }

  @httpGet('/conversations', TYPES.RequireSignIn)
  async getConversations(
    @response() res: Response,
    @request() req: Request
  ) {
    try {
      const user = req.user as IUser;
      
      if (!user || !user._id) {
        return this.sendResponse(res, 401, 'User not authenticated');
      }
      
      const conversations = await this.bidMessageService.getConversations(
        (user._id as string).toString()
      );

      return this.sendResponse(res, 200, 'Conversations retrieved successfully', conversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      return this.sendResponse(res, 500, 'Failed to fetch conversations');
    }
  }

  @httpGet('/messages', TYPES.RequireSignIn)
  async getBidMessages(
    @response() res: Response,
    @request() req: Request,
    @queryParam('productId') productId?: string
  ) {
    try {
      const user = req.user as IUser;
      
      if (!user || !user._id) {
        return this.sendResponse(res, 401, 'User not authenticated');
      }
      
      const messages = await this.bidMessageService.getBidMessages(
        (user._id as string).toString(),
        productId
      );

      return this.sendResponse(res, 200, 'Bid messages retrieved successfully', messages);
    } catch (error) {
      console.error('Error fetching bid messages:', error);
      return this.sendResponse(res, 500, 'Failed to fetch bid messages');
    }
  }

  @httpGet('/:bidId', TYPES.RequireSignIn)
  async getBidDetails(@response() res: Response, @requestParam('bidId') bidId: string) {
    const bid = await this.productBidService.getBidById(bidId);
    
    if (!bid) {
      return this.sendResponse(res, 404, 'Bid not found');
    }

    return this.sendResponse(res, 200, 'Bid details retrieved successfully', bid);
  }
}
