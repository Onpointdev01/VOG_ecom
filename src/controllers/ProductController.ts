import { inject } from 'inversify';
import joiMiddleware from '../middlewares/joiMiddleware';
import {
  controller,
  httpPost,
  httpGet,
  httpPut,
  httpDelete,
  requestParam,
  requestBody,
  response,
  request,
  queryParam,
} from 'inversify-express-utils';
import { Response } from 'express';
import { FilterQuery } from 'mongoose';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IProductBidService, IProductService, IReviewService, IViewTrackingService, IBidMessageService } from '../services';
import { IProduct } from '../models';
import { createProductDTO, createReviewDTO, getAllProductsQuery } from '../utils/dtos';
import { getAllProductsSchema } from '../validators';

@controller('/api/v1/products')
export class ProductController extends BaseController {
  constructor(
    @inject(TYPES.ProductService) private productService: IProductService,
    @inject(TYPES.ProductBidService) private productBidService: IProductBidService,
    @inject(TYPES.ReviewService) private reviewService: IReviewService,
    @inject(TYPES.ViewTrackingService) private viewTrackingService: IViewTrackingService,
    @inject(TYPES.BidMessageService) private bidMessageService: IBidMessageService
  ) {
    super();
  }

  @httpPost('/', TYPES.RequireSignIn, TYPES.RequireSeller)
  async createProduct(@response() res: Response, @requestBody() payload: any, @request() req: any) {
    // Handle different payload structures
    let newProduct;
    const user = req.user; // Get the full user object
    const sellerId = user.seller; // Get the seller ID from the user
    
    if (payload.product && payload.variants) {
      // Variable product with separate product and variants
      payload.product.owner = sellerId;
      newProduct = await this.productService.createVariableProduct(payload);
    } else if (payload.productType === 'simple') {
      // Simple product
      payload.owner = sellerId;
      newProduct = await this.productService.createSimpleProduct(payload);
    } else if (payload.productType === 'variable') {
      // Variable product in flat structure
      payload.owner = sellerId;
      newProduct = await this.productService.createVariableProduct(payload);
    } else {
      // Fallback to original method for backward compatibility
      payload.owner = sellerId;
      newProduct = await this.productService.createProduct(payload);
    }
    
    return this.sendResponse(res, 201, 'Product created successfully', newProduct);
  }

  @httpGet('/:id', TYPES.OptionalAuth)
  async getProductById(@response() res: Response, @requestParam('id') id: string) {
    const product = await this.productService.getProductById(id);
    
    // Track product view if user is authenticated
    if (res.locals.user) {
      try {
        await this.viewTrackingService.trackProductView(res.locals.user, id);
      } catch (error) {
        // Don't fail the request if view tracking fails
        console.warn('Failed to track product view:', error);
      }
    }
    
    return this.sendResponse(res, 200, 'Product retrieved successfully', product);
  }

  @httpGet('/', joiMiddleware(getAllProductsSchema, 'query'), TYPES.OptionalAuth)
  async getAllProducts(@request() req: Request, @response() res: Response, @queryParam() query: getAllProductsQuery) {
    const { isFlash, category, search } = query;
    const filter: FilterQuery<IProduct> = {};
    if (isFlash) {
      filter.isFlash = isFlash === '1';
    }

    const products = await this.productService.getAllProducts(filter, category, search, res.locals.user);
    return this.sendResponse(res, 200, 'Products retrieved successfully', products);
  }

  @httpGet('/category/:categoryId')
  async getProductsByCategory(
    @response() res: Response,
    @requestParam('categoryId') categoryId: string,
    @queryParam('includeSubcategories') includeSubcategories: string = 'false',
    @queryParam('page') page: string = '1',
    @queryParam('limit') limit: string = '20'
  ) {
    const includeSubcats = includeSubcategories.toLowerCase() === 'true';
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const products = await this.productService.getProductsByCategoryId(
      categoryId, 
      includeSubcats, 
      pageNumber, 
      limitNumber
    );
    
    return this.sendResponse(res, 200, 'Category products retrieved successfully', products);
  }

  @httpPut('/:id')
  async updateProduct(
    @response() res: Response,
    @requestParam('id') id: string,
    @requestBody() payload: Partial<IProduct>
  ) {
    const updatedProduct = await this.productService.updateProduct(id, payload);
    return this.sendResponse(res, 200, 'Product updated successfully', updatedProduct);
  }

  @httpDelete('/:id')
  async deleteProduct(@response() res: Response, @requestParam('id') id: string) {
    await this.productService.deleteProduct(id);
    return this.sendResponse(res, 204, 'Product deleted successfully');
  }

  //pruduct reviews
  @httpPost('/:id/reviews', TYPES.RequireSignIn)
  async createReview(
    @response() res: Response,
    @requestParam('id') id: string,
    @requestBody() payload: createReviewDTO
  ) {
    payload.user = res.locals.user;
    payload.product = id;
    payload.reviewType = 'product';

    console.log(payload);
    const newReview = await this.productService.reviewProduct(payload);
    return this.sendResponse(res, 201, 'Review created successfully', newReview);
  }

  @httpGet('/:id/reviews')
  async getProductReviews(@response() res: Response, @requestParam('id') id: string) {
    const reviews = await this.reviewService.getReviewsByProduct(id);
    return this.sendResponse(res, 200, 'Product reviews retrieved successfully', reviews);
  }

  //bid for a product
  @httpPost('/:id/bid', TYPES.RequireSignIn)
  async bidForProduct(
    @response() res: Response,
    @request() req: any,
    @requestParam('id') id: string,
    @requestBody() payload: { bidAmount: number }
  ) {
    // Check if we have a valid user with ID
    const authenticatedUser = req.user || res.locals.user;
    if (!authenticatedUser || !authenticatedUser._id) {
      return this.sendResponse(res, 401, 'User not authenticated');
    }
    
    const bid = await this.productBidService.createBid(id, authenticatedUser._id.toString(), payload.bidAmount);
    
    // Get the product to find the seller/owner for message creation
    const product = await this.productService.getProductById(id);
    
    // Create bid proposal message - this will appear in the chat
    if (product && product.owner) {
      const sellerId = product.owner._id || product.owner;
      
      // Validate all required IDs before proceeding
      if (!authenticatedUser || !authenticatedUser._id) {
        return this.sendResponse(res, 200, 'Bid placed successfully', bid);
      }
      
      if (!sellerId) {
        return this.sendResponse(res, 200, 'Bid placed successfully', bid);
      }
      
      if (!bid || !bid._id) {
        return this.sendResponse(res, 200, 'Bid placed successfully', bid);
      }
      
      try {
        // Create the bid proposal message from user (actual bid amount)
        await this.bidMessageService.createBidProposalMessage(
          authenticatedUser._id.toString(),
          sellerId.toString(),
          id,
          bid._id.toString(),
          `$${payload.bidAmount.toFixed(2)}`
        );

        // Create automatic system response message (from seller to user)
        await this.bidMessageService.createSystemMessage(
          sellerId.toString(),
          authenticatedUser._id.toString(),
          id,
          bid._id.toString(),
          'Please wait for us to confirm or decline your offer'
        );
      } catch (messageError) {
        // Don't fail the bid creation, just silently handle the error
      }
    }
    
    return this.sendResponse(res, 200, 'Bid placed successfully', bid);
  }

  //initiate conversation for product inquiry
  @httpPost('/:id/inquiry', TYPES.RequireSignIn)
  async initiateProductInquiry(
    @response() res: Response,
    @request() req: any,
    @requestParam('id') id: string
  ) {
    // Check if we have a valid user with ID
    const authenticatedUser = req.user || res.locals.user;
    if (!authenticatedUser || !authenticatedUser._id) {
      return this.sendResponse(res, 401, 'User not authenticated');
    }

    // Get the product to find the seller/owner
    const product = await this.productService.getProductById(id);
    if (!product || !product.owner) {
      return this.sendResponse(res, 404, 'Product not found or has no owner');
    }

    const sellerId = product.owner._id || product.owner;

    try {
      // Create initial product inquiry message (user shows interest)
      await this.bidMessageService.createProductInquiryMessage(
        authenticatedUser._id.toString(),
        sellerId.toString(),
        id,
        `Hi! My name is Grace Opata. I would love to make an offer for this item:`,
        product
      );

      // Create automatic system response (seller responds)
      await this.bidMessageService.createSystemMessage(
        sellerId.toString(),
        authenticatedUser._id.toString(),
        id,
        null, // No bid ID yet
        'Hey there; please enter your bid amount'
      );

      return this.sendResponse(res, 200, 'Conversation initiated successfully');
    } catch (error) {
      return this.sendResponse(res, 500, 'Failed to initiate conversation');
    }
  }

  //get all bids for a product (sellers only)
  @httpGet('/:id/bids', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getProductBids(@response() res: Response, @requestParam('id') id: string) {
    const bids = await this.productBidService.getBidsForProduct(id);
    return this.sendResponse(res, 200, 'Product bids retrieved successfully', bids);
  }

  // Admin helper endpoints
  @httpPost('/bulk', TYPES.RequireSignIn, TYPES.RequireSeller)
  async bulkCreateProducts(@response() res: Response, @requestBody() payload: any, @request() req: any) {
    const user = req.user;
    const sellerId = user.seller;
    payload.baseProduct.owner = sellerId;
    const products = await this.productService.bulkCreateSimpleProducts(payload);
    return this.sendResponse(res, 201, `${products.length} products created successfully`, products);
  }

  @httpPost('/:id/duplicate', TYPES.RequireSignIn, TYPES.RequireSeller)
  async duplicateProduct(
    @response() res: Response,
    @requestParam('id') id: string,
    @requestBody() payload: any
  ) {
    const duplicatedProduct = await this.productService.duplicateProduct(id, payload.modifications || {});
    return this.sendResponse(res, 201, 'Product duplicated successfully', duplicatedProduct);
  }
}
