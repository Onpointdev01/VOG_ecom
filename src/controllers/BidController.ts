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
import { Model } from 'mongoose';

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
    @inject(TYPES.CartService) private cartService: ICartService,
    @inject(TYPES.Bid) private Bid: Model<IBid>
  ) {
    super();
  }

  // REMOVED: Seller bid acceptance/rejection routes
  // Only admins can now accept, reject, or cancel bids
  // Use /api/v1/admin/bids/:bidId/accept, /reject, or /cancel instead

  @httpPost('/:bidId/add-to-cart', TYPES.RequireSignIn)
  async addAcceptedBidToCart(
    @response() res: Response,
    @request() req: Request,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { size: string; color: string; productId?: string }
  ) {
    const user = req.user as IUser;
    
    // Get the bid WITHOUT populate to get the raw product ObjectId
    const rawBid = await this.Bid.findById(bidId);
    
    if (!rawBid) {
      return this.sendResponse(res, 404, 'Bid not found');
    }

    // Get populated bid for buyer verification
    const bid = await this.productBidService.getBidById(bidId);
    if (!bid) {
      return this.sendResponse(res, 404, 'Bid not found');
    }

    // Log bid status and price for debugging
    console.log(`[AddToCart] Bid ${bidId} status:`, bid.status);
    console.log(`[AddToCart] Raw bid status:`, rawBid.status);
    console.log(`[AddToCart] Bid price:`, bid.bidPrice, 'Raw bid price:', rawBid.bidPrice);
    
    // Ensure we use the bidPrice from the bid, not the product price
    if (!bid.bidPrice || bid.bidPrice <= 0) {
      console.error(`[AddToCart] Invalid bidPrice for bid ${bidId}:`, bid.bidPrice);
      return this.sendResponse(res, 400, 'Invalid bid price');
    }

    const bidBuyerId = getBuyerId(bid);
      
    if (bidBuyerId !== (user._id as string).toString()) {
      return this.sendResponse(res, 403, 'You can only add your own accepted bids to cart');
    }

    // Check status from rawBid (non-populated) to ensure we have the latest status
    if (rawBid.status !== 'ACCEPTED' && bid.status !== 'ACCEPTED') {
      console.error(`[AddToCart] Bid ${bidId} has invalid status. Raw: ${rawBid.status}, Populated: ${bid.status}`);
      return this.sendResponse(res, 400, `Only accepted bids can be added to cart. Current status: ${rawBid.status}`);
    }

    // Check if bid has expired
    if (bid.expiresAt && bid.expiresAt < new Date()) {
      return this.sendResponse(res, 400, 'This bid has expired');
    }

    // Extract productId from raw bid (non-populated) to get the ObjectId directly
    let productId: string;
    
    // Handle different formats of product in rawBid
    if (!rawBid.product) {
      console.error('rawBid.product is missing for bidId:', bidId);
      // Fallback: Use productId from payload if provided and valid
      if (payload.productId) {
        const payloadProductId = String(payload.productId).trim();
        if (payloadProductId.length === 24 && /^[0-9a-fA-F]{24}$/.test(payloadProductId)) {
          console.log('Using productId from payload as fallback (product missing):', payloadProductId);
          productId = payloadProductId;
        } else {
          return this.sendResponse(res, 400, 'Bid product is missing and provided productId is invalid');
        }
      } else {
        return this.sendResponse(res, 400, 'Bid product is missing');
      }
    } else {
      // Try to extract productId in multiple ways
      try {
      // Method 1: Direct ObjectId (most common case)
      if (typeof rawBid.product === 'object') {
        // Check if it's a mongoose ObjectId
        if ((rawBid.product as any).constructor?.name === 'ObjectId' || (rawBid.product as any)._bsontype === 'ObjectId') {
          productId = (rawBid.product as any).toString();
        } else if ((rawBid.product as any)._id) {
          productId = (rawBid.product as any)._id.toString();
        } else if ((rawBid.product as any).id) {
          productId = (rawBid.product as any).id.toString();
        } else if ((rawBid.product as any).toString) {
          productId = (rawBid.product as any).toString();
        } else {
          productId = String(rawBid.product);
        }
      } else if (typeof rawBid.product === 'string') {
        productId = rawBid.product;
      } else {
        productId = String(rawBid.product);
      }
      
      // Clean the productId
      productId = productId.trim();
      
      // Validate productId format (MongoDB ObjectId is 24 hex characters)
      if (!productId || productId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(productId)) {
        console.error('Invalid productId format after extraction:', {
          productId,
          type: typeof rawBid.product,
          rawValue: rawBid.product,
          bidId
        });
        
        // Fallback: Use productId from payload if provided and valid
        if (payload.productId) {
          const payloadProductId = String(payload.productId).trim();
          if (payloadProductId.length === 24 && /^[0-9a-fA-F]{24}$/.test(payloadProductId)) {
            console.log('Using productId from payload as fallback:', payloadProductId);
            productId = payloadProductId;
          } else {
            return this.sendResponse(res, 400, `Invalid product ID format: ${productId}`);
          }
        } else {
          return this.sendResponse(res, 400, `Invalid product ID format: ${productId}`);
        }
      }
      } catch (error) {
        console.error('Error extracting productId:', error, 'rawBid.product:', rawBid.product);
        // Fallback: Use productId from payload if provided and valid
        if (payload.productId) {
          const payloadProductId = String(payload.productId).trim();
          if (payloadProductId.length === 24 && /^[0-9a-fA-F]{24}$/.test(payloadProductId)) {
            console.log('Using productId from payload as fallback (extraction error):', payloadProductId);
            productId = payloadProductId;
          } else {
            return this.sendResponse(res, 400, 'Failed to extract product ID from bid and provided productId is invalid');
          }
        } else {
          return this.sendResponse(res, 400, 'Failed to extract product ID from bid');
        }
      }
    }
    
    const cartItem = await this.cartService.addBidToCart(
      (user._id as string).toString(),
      productId,
      bid.bidPrice,
      payload.size,
      payload.color,
      bidId
    );

    // Mark bid as converted to cart
    await this.productBidService.markBidAsConverted(bidId);

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