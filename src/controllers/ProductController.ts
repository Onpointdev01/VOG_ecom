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
import { Response, Request } from 'express';
import { FilterQuery } from 'mongoose';

import { BaseController } from './BaseController';
import TYPES from '../di';
import {
  IProductService,
  IReviewService,
  IViewTrackingService,
  IOfferService,
  IConversationService,
  IMessageService,
} from '../services';
import { IProduct, IUser } from '../models';
import { createProductDTO, createReviewDTO, getAllProductsQuery } from '../utils/dtos';
import { toIdString } from '../utils/mongoId';
import { getAllProductsSchema } from '../validators';

@controller('/api/v1/products')
export class ProductController extends BaseController {
  constructor(
    @inject(TYPES.ProductService) private productService: IProductService,
    @inject(TYPES.OfferService) private offerService: IOfferService,
    @inject(TYPES.ConversationService) private conversationService: IConversationService,
    @inject(TYPES.MessageService) private messageService: IMessageService,
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

  @httpGet('/suggestions')
  async getSearchSuggestions(@response() res: Response, @queryParam('q') query: string) {
    if (!query || query.trim().length < 2) {
      return this.sendResponse(res, 200, 'Search suggestions retrieved successfully', []);
    }

    const suggestions = await this.productService.getSearchSuggestions(query.trim());
    return this.sendResponse(res, 200, 'Search suggestions retrieved successfully', suggestions);
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
    const {
      isFlash,
      isRecommended,
      category,
      search,
      sortBy,
      sortOrder,
      minPrice,
      maxPrice,
      condition,
      brand,
      page,
      limit
    } = query;

    const filter: FilterQuery<IProduct> = {};
    if (isFlash) {
      filter.isFlash = isFlash === '1';
    }
    if (isRecommended) {
      filter.isRecommended = isRecommended === '1';
    }
    if (condition) {
      filter.condition = condition;
    }
    if (brand) {
      filter.brand = new RegExp(brand, 'i'); // Case-insensitive brand search
    }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }
    
    const options = {
      sortBy: sortBy || 'createdAt',
      sortOrder: sortOrder || 'desc',
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20
    };

    const products = await this.productService.getAllProducts(filter, category, search, res.locals.user, options);
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

  @httpGet('/seller/:sellerId')
  async getProductsBySeller(
    @response() res: Response,
    @requestParam('sellerId') sellerId: string,
    @queryParam('page') page: string = '1',
    @queryParam('limit') limit: string = '20'
  ) {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const products = await this.productService.getProductsBySellerId(
      sellerId,
      pageNumber,
      limitNumber
    );

    return this.sendResponse(res, 200, 'Seller products retrieved successfully', products);
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

  /** @deprecated Use POST /api/v1/products/:productId/offers */
  @httpPost('/:id/bid', TYPES.RequireSignIn)
  async bidForProduct(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') id: string,
    @requestBody() payload: { bidAmount: number }
  ) {
    res.setHeader('X-API-Deprecated', 'true');
    const authenticatedUser = req.user || (res.locals as { user?: IUser }).user;
    if (!authenticatedUser?._id) {
      return this.sendResponse(res, 401, 'User not authenticated');
    }

    const result = await this.offerService.createOffer(
      id,
      authenticatedUser._id.toString(),
      payload.bidAmount
    );
    return this.sendResponse(res, 200, 'Bid placed successfully (deprecated)', {
      bid: result.offer,
      offer: result.offer,
      conversation: result.conversation,
    });
  }

  /** @deprecated Use POST /api/v1/conversations/product/:productId */
  @httpPost('/:id/inquiry', TYPES.RequireSignIn)
  async initiateProductInquiry(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') id: string
  ) {
    res.setHeader('X-API-Deprecated', 'true');
    const authenticatedUser = req.user || (res.locals as { user?: IUser }).user;
    if (!authenticatedUser?._id) {
      return this.sendResponse(res, 401, 'User not authenticated');
    }

    const buyerId = authenticatedUser._id.toString();
    const { sellerUserId } = await this.conversationService.resolveSellerContext(id);
    const conversation = await this.conversationService.createOrGetConversation(id, buyerId);

    const userName =
      authenticatedUser.firstName && authenticatedUser.lastName
        ? `${authenticatedUser.firstName} ${authenticatedUser.lastName}`
        : 'User';

    await this.messageService.createTypedMessage({
      conversationId: toIdString(conversation),
      senderId: buyerId,
      recipientId: sellerUserId,
      productId: id,
      type: 'PRODUCT_INQUIRY',
      text: `Hi! My name is ${userName}. I would love to make an offer for this item.`,
    });

    await this.messageService.createTypedMessage({
      conversationId: toIdString(conversation),
      senderId: sellerUserId,
      recipientId: buyerId,
      productId: id,
      type: 'SYSTEM',
      text: 'Please enter your offer amount when you are ready.',
    });

    return this.sendResponse(res, 200, 'Conversation initiated successfully (deprecated)', conversation);
  }

  @httpGet('/:id/bids', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getProductBids(@response() res: Response, @requestParam('id') id: string) {
    res.setHeader('X-API-Deprecated', 'true');
    const user = (res.locals as { user?: IUser }).user;
    const sellerId = user?.seller?._id || user?.seller;
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Only sellers can view product offers');
    }
    const result = await this.offerService.getSellerOffers(sellerId.toString(), 'PENDING', 1, 100);
    const offers = result.offers.filter((o) => toIdString(o.product) === id);
    return this.sendResponse(res, 200, 'Product bids retrieved successfully (deprecated)', offers);
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
