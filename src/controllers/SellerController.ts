import { inject } from 'inversify';
import {
  controller,
  httpGet,
  requestParam,
  response,
} from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { ISellerService } from '../services/SellerService';

@controller('/api/v1/sellers')
export class SellerController extends BaseController {
  constructor(
    @inject(TYPES.SellerService) private sellerService: ISellerService
  ) {
    super();
  }

  @httpGet('/:id')
  async getSellerById(
    @response() res: Response,
    @requestParam('id') id: string
  ) {
    const seller = await this.sellerService.getSellerById(id);
    return this.sendResponse(res, 200, 'Seller retrieved successfully', seller);
  }
}
