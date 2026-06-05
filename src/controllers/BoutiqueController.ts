import { inject } from 'inversify';
import {
  controller,
  httpGet,
  queryParam,
  requestParam,
  response,
} from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { ISellerService } from '../services/SellerService';
import { IProductService } from '../services/ProductService';

@controller('/api/v1/boutiques')
export class BoutiqueController extends BaseController {
  constructor(
    @inject(TYPES.SellerService) private sellerService: ISellerService,
    @inject(TYPES.ProductService) private productService: IProductService
  ) {
    super();
  }

  @httpGet('/')
  async listBoutiques(
    @response() res: Response,
    @queryParam('page') page: string = '1',
    @queryParam('limit') limit: string = '20',
    @queryParam('search') search?: string
  ) {
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const result = await this.sellerService.listBoutiques({
      page: pageNumber,
      limit: limitNumber,
      search,
    });

    return this.sendResponse(res, 200, 'Boutiques retrieved successfully', result);
  }

  @httpGet('/top/performance')
  async getTopPerformingBoutiques(
    @response() res: Response,
    @queryParam('limit') limit: string = '5'
  ) {
    const limitNumber = Math.min(50, Math.max(1, parseInt(limit, 10) || 5));
    const boutiques = await this.sellerService.getTopPerformingBoutiques(limitNumber);
    return this.sendResponse(res, 200, 'Top boutiques retrieved successfully', boutiques);
  }

  @httpGet('/:boutiqueId/products')
  async getBoutiqueProducts(
    @response() res: Response,
    @requestParam('boutiqueId') boutiqueId: string,
    @queryParam('page') page: string = '1',
    @queryParam('limit') limit: string = '20'
  ) {
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const products = await this.productService.getProductsBySellerId(
      boutiqueId,
      pageNumber,
      limitNumber
    );

    return this.sendResponse(res, 200, 'Boutique products retrieved successfully', products);
  }
}
