/**
 * BoutiqueController – read-only endpoints for boutique listing, discovery, and products.
 * Routes are additive; no changes to existing APIs.
 */
import { inject } from 'inversify';
import {
  controller,
  httpGet,
  requestParam,
  queryParam,
  response,
} from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IBoutiqueService } from '../services/BoutiqueService';
import { IProductService } from '../services/ProductService';

@controller('/api/v1/boutiques')
export class BoutiqueController extends BaseController {
  constructor(
    @inject(TYPES.BoutiqueService) private boutiqueService: IBoutiqueService,
    @inject(TYPES.ProductService) private productService: IProductService
  ) {
    super();
  }

  /**
   * GET /api/v1/boutiques
   * List boutiques with pagination and optional search by name.
   */
  @httpGet('/')
  async listBoutiques(
    @response() res: Response,
    @queryParam('page') page: string = '1',
    @queryParam('limit') limit: string = '20',
    @queryParam('search') search?: string
  ) {
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const result = await this.boutiqueService.listBoutiques(pageNumber, limitNumber, search);
    return this.sendResponse(res, 200, 'Boutiques retrieved successfully', result);
  }

  /**
   * GET /api/v1/boutiques/top/performance?limit=5
   * Top boutiques by computed performance (sales, orders, product count, rating). No stored score.
   */
  @httpGet('/top/performance')
  async getTopByPerformance(
    @response() res: Response,
    @queryParam('limit') limit: string = '5'
  ) {
    const limitNumber = Math.min(50, Math.max(1, parseInt(limit, 10) || 5));
    const data = await this.boutiqueService.getTopByPerformance(limitNumber);
    return this.sendResponse(res, 200, 'Top boutiques by performance', data);
  }

  /**
   * GET /api/v1/boutiques/:boutiqueId/products
   * Products belonging to a boutique with optional filters and sort.
   */
  @httpGet('/:boutiqueId/products')
  async getBoutiqueProducts(
    @response() res: Response,
    @requestParam('boutiqueId') boutiqueId: string,
    @queryParam('page') page: string = '1',
    @queryParam('limit') limit: string = '20',
    @queryParam('category') category?: string,
    @queryParam('min_price') min_price?: string,
    @queryParam('max_price') max_price?: string,
    @queryParam('in_stock') in_stock?: string,
    @queryParam('sort') sort?: string
  ) {
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filters: {
      category?: string;
      min_price?: number;
      max_price?: number;
      in_stock?: boolean;
      sort?: 'price_asc' | 'price_desc' | 'newest' | 'best_selling';
    } = {};
    if (category) filters.category = category;
    if (min_price != null) {
      const n = parseFloat(min_price);
      if (!isNaN(n)) filters.min_price = n;
    }
    if (max_price != null) {
      const n = parseFloat(max_price);
      if (!isNaN(n)) filters.max_price = n;
    }
    if (in_stock === '1' || in_stock === 'true') filters.in_stock = true;
    const validSort = ['price_asc', 'price_desc', 'newest', 'best_selling'].includes(sort || '')
      ? sort
      : undefined;
    if (validSort) filters.sort = validSort as 'price_asc' | 'price_desc' | 'newest' | 'best_selling';

    const result = await this.productService.getProductsByBoutiqueId(
      boutiqueId,
      pageNumber,
      limitNumber,
      Object.keys(filters).length ? filters : undefined
    );
    return this.sendResponse(res, 200, 'Boutique products retrieved successfully', result);
  }
}
