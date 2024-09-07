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
import { IProductService } from '../services';
import { IProduct } from '../models';
import { createProductDTO, createReviewDTO, getAllProductsQuery } from '../utils/dtos';
import { getAllProductsSchema } from '../validators';

@controller('/api/v1/products')
export class ProductController extends BaseController {
  constructor(@inject(TYPES.ProductService) private productService: IProductService) {
    super();
  }

  @httpPost('/', TYPES.RequireSignIn, TYPES.RequireSeller)
  async createProduct(@response() res: Response, @requestBody() payload: createProductDTO) {
    payload.owner = res.locals.user;
    const newProduct = await this.productService.createProduct(payload);
    return this.sendResponse(res, 201, 'Product created successfully', newProduct);
  }

  @httpGet('/:id')
  async getProductById(@response() res: Response, @requestParam('id') id: string) {
    const product = await this.productService.getProductById(id);
    return this.sendResponse(res, 200, 'Product retrieved successfully', product);
  }

  @httpGet('/', joiMiddleware(getAllProductsSchema, 'query'))
  async getAllProducts(@request() req: Request, @response() res: Response, @queryParam() query: getAllProductsQuery) {
    const { isFlash, category, search } = query;
    const filter: FilterQuery<IProduct> = {};
    if (isFlash) {
      filter.isFlash = isFlash === '1';
    }
    // if (category) {
    //   filter.category = category;
    // }

    const products = await this.productService.getAllProducts(filter, category, search);
    return this.sendResponse(res, 200, 'Products retrieved successfully', products);
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
}
