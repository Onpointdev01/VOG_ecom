import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPost,
  httpPut,
  httpDelete,
  requestParam,
  requestBody,
  response,
  queryParam,
  request,
} from 'inversify-express-utils';
import { Response, Request } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IPayoutService, ISellerService, IProductService } from '../services';
import AppError from '../utils/errors/AppError';
import { Brand } from '../models/Brand';

/**
 * @swagger
 * tags:
 *   name: Seller
 *   description: Seller-specific endpoints
 */
@controller('/api/v1/seller')
export class SellerController extends BaseController {
  constructor(
    @inject(TYPES.PayoutService) private payoutService: IPayoutService,
    @inject(TYPES.SellerService) private sellerService: ISellerService,
    @inject(TYPES.ProductService) private productService: IProductService
  ) {
    super();
  }

  /**
   * @swagger
   * /api/v1/seller/earnings:
   *   get:
   *     summary: Get seller earnings with filtering and pagination
   *     tags: [Seller]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: from
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date (YYYY-MM-DD)
   *       - in: query
   *         name: to
   *         schema:
   *           type: string
   *           format: date
   *         description: End date (YYYY-MM-DD)
   *       - in: query
   *         name: productId
   *         schema:
   *           type: string
   *         description: Filter by product ID
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [PENDING, PROCESSED, FAILED]
   *         description: Filter by payout status
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *         description: Items per page
   *     responses:
   *       200:
   *         description: Earnings retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: object
   *                   properties:
   *                     payouts:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Payout'
   *                     total:
   *                       type: integer
   *                     page:
   *                       type: integer
   *                     totalPages:
   *                       type: integer
   *                     totalEarnings:
   *                       type: number
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Seller access required
   */
  /**
   * Get seller earnings with filtering and pagination
   * GET /api/v1/seller/earnings?from=2024-01-01&to=2024-12-31&productId=xxx&status=PROCESSED&page=1&limit=20
   */
  @httpGet('/earnings', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getEarnings(
    @response() res: Response,
    @request() req: Request,
    @queryParam('from') from?: string,
    @queryParam('to') to?: string,
    @queryParam('productId') productId?: string,
    @queryParam('status') status?: string,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string
  ) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    // user.seller can be:
    // - An ObjectId (from checkBannedOrDeleted - not populated)
    // - A string (from AuthService.login response)
    // - An object with _id (if populated)
    let sellerId: string;
    if (typeof user.seller === 'string') {
      sellerId = user.seller;
    } else if (user.seller && typeof user.seller === 'object') {
      sellerId = (user.seller as any)._id?.toString() || (user.seller as any).id?.toString() || user.seller.toString();
    } else {
      sellerId = user.seller.toString();
    }

    const filters: any = {};
    if (from) filters.from = new Date(from);
    if (to) filters.to = new Date(to);
    if (productId) filters.productId = productId;
    if (status && ['PENDING', 'PROCESSED', 'FAILED'].includes(status)) {
      filters.status = status;
    }

    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    const result = await this.payoutService.getSellerEarnings(
      sellerId.toString(),
      filters,
      pageNum,
      limitNum
    );

    return this.sendResponse(res, 200, 'Earnings retrieved successfully', result);
  }

  /**
   * Export seller earnings as CSV
   * GET /api/v1/seller/earnings/export?from=2024-01-01&to=2024-12-31
   */
  @httpGet('/earnings/export', TYPES.RequireSignIn, TYPES.RequireSeller)
  async exportEarnings(
    @response() res: Response,
    @request() req: Request,
    @queryParam('from') from?: string,
    @queryParam('to') to?: string
  ) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    // user.seller can be:
    // - An ObjectId (from checkBannedOrDeleted - not populated)
    // - A string (from AuthService.login response)
    // - An object with _id (if populated)
    let sellerId: string;
    if (typeof user.seller === 'string') {
      sellerId = user.seller;
    } else if (user.seller && typeof user.seller === 'object') {
      sellerId = (user.seller as any)._id?.toString() || (user.seller as any).id?.toString() || user.seller.toString();
    } else {
      sellerId = user.seller.toString();
    }

    const filters: any = {};
    if (from) filters.from = new Date(from);
    if (to) filters.to = new Date(to);

    const csv = await this.payoutService.exportEarningsCSV(sellerId.toString(), filters);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="earnings-${Date.now()}.csv"`);
    return res.send(csv);
  }

  /**
   * Get seller profile
   * GET /api/v1/seller/profile
   */
  @httpGet('/profile', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getProfile(@response() res: Response, @request() req: Request) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    // user.seller can be:
    // - An ObjectId (from checkBannedOrDeleted - not populated)
    // - A string (from AuthService.login response)
    // - An object with _id (if populated)
    let sellerId: string;
    if (typeof user.seller === 'string') {
      sellerId = user.seller;
    } else if (user.seller && typeof user.seller === 'object') {
      sellerId = (user.seller as any)._id?.toString() || (user.seller as any).id?.toString() || user.seller.toString();
    } else {
      sellerId = user.seller.toString();
    }
    const profile = await this.sellerService.getSellerProfile(sellerId.toString());

    return this.sendResponse(res, 200, 'Profile retrieved successfully', profile);
  }

  /**
   * Update seller profile
   * PUT /api/v1/seller/profile
   */
  @httpPut('/profile', TYPES.RequireSignIn, TYPES.RequireSeller)
  async updateProfile(
    @response() res: Response,
    @request() req: Request,
    @requestBody() body: any
  ) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    console.log('Updating seller profile with data:', body);
    console.log('Logo in request:', body.logo);

    const sellerId = user.seller._id || user.seller;
    const updatedProfile = await this.sellerService.updateSellerProfile(
      sellerId.toString(),
      body
    );

    console.log('Updated profile returned, logo:', updatedProfile.logo);

    return this.sendResponse(res, 200, 'Profile updated successfully', updatedProfile);
  }

  /**
   * Get seller products
   * GET /api/v1/seller/products?page=1&limit=20&isActive=true&search=keyword
   */
  @httpGet('/products', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getProducts(
    @response() res: Response,
    @request() req: Request,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('isActive') isActive?: string,
    @queryParam('search') search?: string
  ) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    // user.seller can be:
    // - An ObjectId (from checkBannedOrDeleted - not populated)
    // - A string (from AuthService.login response)
    // - An object with _id (if populated)
    let sellerId: string;
    if (typeof user.seller === 'string') {
      sellerId = user.seller;
    } else if (user.seller && typeof user.seller === 'object') {
      sellerId = (user.seller as any)._id?.toString() || (user.seller as any).id?.toString() || user.seller.toString();
    } else {
      sellerId = user.seller.toString();
    }
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    const filters: any = {};
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    if (search) {
      filters.search = search;
    }

    const result = await this.sellerService.getSellerProducts(
      sellerId.toString(),
      pageNum,
      limitNum,
      filters
    );

    return this.sendResponse(res, 200, 'Products retrieved successfully', result);
  }

  /**
   * Get seller orders (read-only)
   * GET /api/v1/seller/orders?page=1&limit=20&status=PENDING
   */
  @httpGet('/orders', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getOrders(
    @response() res: Response,
    @request() req: Request,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('status') status?: string
  ) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    // user.seller can be:
    // - An ObjectId (from checkBannedOrDeleted - not populated)
    // - A string (from AuthService.login response)
    // - An object with _id (if populated)
    let sellerId: string;
    if (typeof user.seller === 'string') {
      sellerId = user.seller;
    } else if (user.seller && typeof user.seller === 'object') {
      sellerId = (user.seller as any)._id?.toString() || (user.seller as any).id?.toString() || user.seller.toString();
    } else {
      sellerId = user.seller.toString();
    }
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    const result = await this.sellerService.getSellerOrders(
      sellerId.toString(),
      pageNum,
      limitNum,
      status
    );

    return this.sendResponse(res, 200, 'Orders retrieved successfully', result);
  }

  /**
   * Get seller order by ID (read-only)
   * GET /api/v1/seller/orders/:id
   */
  @httpGet('/orders/:id', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getOrderById(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') orderId: string
  ) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    // user.seller can be:
    // - An ObjectId (from checkBannedOrDeleted - not populated)
    // - A string (from AuthService.login response)
    // - An object with _id (if populated)
    let sellerId: string;
    if (typeof user.seller === 'string') {
      sellerId = user.seller;
    } else if (user.seller && typeof user.seller === 'object') {
      sellerId = (user.seller as any)._id?.toString() || (user.seller as any).id?.toString() || user.seller.toString();
    } else {
      sellerId = user.seller.toString();
    }
    const order = await this.sellerService.getSellerOrderById(
      sellerId.toString(),
      orderId
    );

    return this.sendResponse(res, 200, 'Order retrieved successfully', order);
  }

  /**
   * Get seller bids
   * GET /api/v1/seller/bids?page=1&limit=20&status=PENDING
   */
  @httpGet('/bids', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getBids(
    @response() res: Response,
    @request() req: Request,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('status') status?: string
  ) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    // user.seller can be:
    // - An ObjectId (from checkBannedOrDeleted - not populated)
    // - A string (from AuthService.login response)
    // - An object with _id (if populated)
    let sellerId: string;
    if (typeof user.seller === 'string') {
      sellerId = user.seller;
    } else if (user.seller && typeof user.seller === 'object') {
      sellerId = (user.seller as any)._id?.toString() || (user.seller as any).id?.toString() || user.seller.toString();
    } else {
      sellerId = user.seller.toString();
    }
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    const result = await this.sellerService.getSellerBids(
      sellerId.toString(),
      pageNum,
      limitNum,
      status
    );

    return this.sendResponse(res, 200, 'Bids retrieved successfully', result);
  }

  /**
   * Get seller statistics
   * GET /api/v1/seller/stats
   */
  @httpGet('/stats', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getStats(@response() res: Response, @request() req: Request) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    // user.seller can be:
    // - An ObjectId (from checkBannedOrDeleted - not populated)
    // - A string (from AuthService.login response)
    // - An object with _id (if populated)
    let sellerId: string;
    if (typeof user.seller === 'string') {
      sellerId = user.seller;
    } else if (user.seller && typeof user.seller === 'object') {
      sellerId = (user.seller as any)._id?.toString() || (user.seller as any).id?.toString() || user.seller.toString();
    } else {
      sellerId = user.seller.toString();
    }
    const stats = await this.sellerService.getSellerStats(sellerId.toString());

    return this.sendResponse(res, 200, 'Statistics retrieved successfully', stats);
  }

  /**
   * Get all active brands (public endpoint for sellers)
   * GET /api/v1/seller/brands
   */
  @httpGet('/brands')
  async getBrands(@response() res: Response) {
    try {
      const brands = await Brand.find({ isActive: true }).sort({ name: 1 });
      return this.sendResponse(res, 200, 'Brands retrieved successfully', brands);
    } catch (error) {
      console.error('Error fetching brands:', error);
      throw new AppError('Failed to fetch brands', 500);
    }
  }

  /**
   * Get platform-wide statistics (public endpoint)
   * GET /api/v1/seller/platform-stats
   */
  @httpGet('/platform-stats')
  async getPlatformStats(@response() res: Response) {
    const stats = await this.sellerService.getPlatformStats();
    return this.sendResponse(res, 200, 'Platform statistics retrieved successfully', stats);
  }

  /**
   * Create a new product
   * POST /api/v1/seller/products
   */
  @httpPost('/products', TYPES.RequireSignIn, TYPES.RequireSeller)
  async createProduct(
    @response() res: Response,
    @request() req: Request,
    @requestBody() payload: any
  ) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    // user.seller can be:
    // - An ObjectId (from checkBannedOrDeleted - not populated)
    // - A string (from AuthService.login response)
    // - An object with _id (if populated)
    let sellerId: string;
    if (typeof user.seller === 'string') {
      sellerId = user.seller;
    } else if (user.seller && typeof user.seller === 'object') {
      sellerId = (user.seller as any)._id?.toString() || (user.seller as any).id?.toString() || user.seller.toString();
    } else {
      sellerId = user.seller.toString();
    }
    
    // Ensure the product owner is set to the seller
    if (payload.product && payload.variants) {
      // Variable product with separate product and variants
      payload.product.owner = sellerId;
      const newProduct = await this.productService.createVariableProduct(payload);
      return this.sendResponse(res, 201, 'Product created successfully', newProduct);
    } else if (payload.productType === 'simple') {
      // Simple product
      payload.owner = sellerId;
      const newProduct = await this.productService.createSimpleProduct(payload);
      return this.sendResponse(res, 201, 'Product created successfully', newProduct);
    } else if (payload.productType === 'variable') {
      // Variable product in flat structure
      payload.owner = sellerId;
      const newProduct = await this.productService.createVariableProduct(payload);
      return this.sendResponse(res, 201, 'Product created successfully', newProduct);
    } else {
      // Fallback to original method
      payload.owner = sellerId;
      const newProduct = await this.productService.createProduct(payload);
      return this.sendResponse(res, 201, 'Product created successfully', newProduct);
    }
  }

  /**
   * Update a product (only if owned by seller)
   * PUT /api/v1/seller/products/:id
   */
  @httpPut('/products/:id', TYPES.RequireSignIn, TYPES.RequireSeller)
  async updateProduct(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') productId: string,
    @requestBody() payload: any
  ) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    // user.seller can be:
    // - An ObjectId (from checkBannedOrDeleted - not populated)
    // - A string (from AuthService.login response)
    // - An object with _id (if populated)
    let sellerId: string;
    if (typeof user.seller === 'string') {
      sellerId = user.seller;
    } else if (user.seller && typeof user.seller === 'object') {
      sellerId = (user.seller as any)._id?.toString() || (user.seller as any).id?.toString() || user.seller.toString();
    } else {
      sellerId = user.seller.toString();
    }
    
    // Verify product exists and belongs to this seller
    const product = await this.productService.getProductById(productId);
    // product.owner can be an object with 'id' field (from getProductById) or an ObjectId string
    const productOwnerId = (product.owner as any)?.id?.toString() || (product.owner as any)?._id?.toString() || (product.owner as any)?.toString() || product.owner?.toString();
    
    // Debug logging
    console.log('🔍 Update Product Debug:');
    console.log('  sellerId:', sellerId, typeof sellerId);
    console.log('  productOwnerId:', productOwnerId, typeof productOwnerId);
    console.log('  user.seller:', user.seller, typeof user.seller);
    console.log('  product.owner:', product.owner);
    console.log('  Match:', sellerId === productOwnerId);
    
    if (!productOwnerId || productOwnerId !== sellerId) {
      throw new AppError('You do not have permission to update this product', 403);
    }

    // Ensure owner cannot be changed
    delete payload.owner;

    const updatedProduct = await this.productService.updateProduct(productId, payload);
    return this.sendResponse(res, 200, 'Product updated successfully', updatedProduct);
  }

  /**
   * Delete a product (only if owned by seller)
   * DELETE /api/v1/seller/products/:id
   */
  @httpDelete('/products/:id', TYPES.RequireSignIn, TYPES.RequireSeller)
  async deleteProduct(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') productId: string
  ) {
    const user = (req as any).user;
    if (!user || !user.seller) {
      throw new AppError('Seller profile not found', 404);
    }

    // user.seller can be:
    // - An ObjectId (from checkBannedOrDeleted - not populated)
    // - A string (from AuthService.login response)
    // - An object with _id (if populated)
    let sellerId: string;
    if (typeof user.seller === 'string') {
      sellerId = user.seller;
    } else if (user.seller && typeof user.seller === 'object') {
      sellerId = (user.seller as any)._id?.toString() || (user.seller as any).id?.toString() || user.seller.toString();
    } else {
      sellerId = user.seller.toString();
    }
    
    // Verify product exists and belongs to this seller
    const product = await this.productService.getProductById(productId);
    // product.owner can be an object with 'id' field (from getProductById) or an ObjectId string
    const productOwnerId = (product.owner as any)?.id?.toString() || (product.owner as any)?._id?.toString() || (product.owner as any)?.toString() || product.owner?.toString();
    
    if (!productOwnerId || productOwnerId !== sellerId) {
      throw new AppError('You do not have permission to delete this product', 403);
    }

    await this.productService.deleteProduct(productId);
    return this.sendResponse(res, 200, 'Product deleted successfully');
  }
}
