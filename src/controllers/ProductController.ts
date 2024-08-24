import { controller, httpGet, httpPost, response, request } from 'inversify-express-utils';
import { BaseController } from './BaseController';
import { inject } from 'inversify';
import TYPES from '../di';
import { IProductService } from '../services';
import { Request, Response } from 'express';

@controller('/api/v1/products')
export class ProductController extends BaseController {
  constructor(@inject(TYPES.ProductService) private productService: IProductService) {
    super();
  }

  @httpGet('/')
  async getAllProducts(@request() req: Request, @response() res: Response) {
    const products = await this.productService.getAllProducts();
    return this.sendResponse(res, 200, 'All products', products);
  }

  @httpGet('/:id')
  async getProductById() {
    return 'Product by id';
  }

  @httpPost('/')
  async createProduct() {
    return 'Product created';
  }
}
