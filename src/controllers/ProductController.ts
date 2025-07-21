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
import { IProductBidService, IProductService, IReviewService, IViewTrackingService } from '../services';
import { IProduct } from '../models';
import { createProductDTO, createReviewDTO, getAllProductsQuery } from '../utils/dtos';
import { getAllProductsSchema } from '../validators';

@controller('/api/v1/products')
export class ProductController extends BaseController {
  constructor(
    @inject(TYPES.ProductService) private productService: IProductService,
    @inject(TYPES.ProductBidService) private productBidService: IProductBidService,
    @inject(TYPES.ReviewService) private reviewService: IReviewService,
    @inject(TYPES.ViewTrackingService) private viewTrackingService: IViewTrackingService
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
    @requestParam('id') id: string,
    @requestBody() payload: { bidAmount: number }
  ) {
    const bid = await this.productBidService.createBid(id, res.locals.user, payload.bidAmount);
    return this.sendResponse(res, 200, 'Bid placed successfully', bid);
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
