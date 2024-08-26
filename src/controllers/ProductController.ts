import { inject } from 'inversify';
import { controller, httpPost, httpGet, httpPut, httpDelete, requestParam, requestBody, response } from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IProductService } from '../services';
import { IProduct } from '../models';

@controller('/api/v1/products')
export class ProductController extends BaseController {
  constructor(@inject(TYPES.ProductService) private productService: IProductService) {
    super();
  }

  @httpPost('/')
  async createProduct(@response() res: Response, @requestBody() payload: Partial<IProduct>) {
    const newProduct = await this.productService.createProduct(payload);
    return this.sendResponse(res, 201, 'Product created successfully', newProduct);
  }

  @httpGet('/:id')
  async getProductById(@response() res: Response, @requestParam('id') id: string) {
    const product = await this.productService.getProductById(id);
    return this.sendResponse(res, 200, 'Product retrieved successfully', product);
  }

  @httpGet('/')
  async getAllProducts(@response() res: Response) {
    const products = await this.productService.getAllProducts();
    return this.sendResponse(res, 200, 'Products retrieved successfully', products);
  }

  @httpPut('/:id')
  async updateProduct(@response() res: Response, @requestParam('id') id: string, @requestBody() payload: Partial<IProduct>) {
    const updatedProduct = await this.productService.updateProduct(id, payload);
    return this.sendResponse(res, 200, 'Product updated successfully', updatedProduct);
  }

  @httpDelete('/:id')
  async deleteProduct(@response() res: Response, @requestParam('id') id: string) {
    await this.productService.deleteProduct(id);
    return this.sendResponse(res, 204, 'Product deleted successfully');
  }
}
