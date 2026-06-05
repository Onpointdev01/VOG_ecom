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
  request,
  queryParam,
} from 'inversify-express-utils';
import { Response, Request } from 'express';
import { BaseController } from './BaseController';
import TYPES from '../di';
import { IProductService } from '../services';
import { IUser } from '../models';

@controller('/api/v1/seller/products')
export class SellerProductController extends BaseController {
  constructor(@inject(TYPES.ProductService) private productService: IProductService) {
    super();
  }

  @httpGet('/', TYPES.RequireSignIn, TYPES.RequireSeller)
  async listMyProducts(
    @response() res: Response,
    @request() req: Request,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('search') search?: string,
    @queryParam('isActive') isActive?: string,
    @queryParam('category') category?: string
  ) {
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Seller account required');
    }

    const pageNumber = Math.max(1, parseInt(page || '1', 10));
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit || '12', 10)));
    const isActiveFilter =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;

    const result = await this.productService.getProductsBySellerId(
      sellerId.toString(),
      pageNumber,
      limitNumber,
      {
        search,
        isActive: isActiveFilter,
        category: category || undefined,
      }
    );

    return this.sendResponse(res, 200, 'Seller products retrieved successfully', {
      products: result.products,
      pagination: {
        total: result.total,
        totalPages: result.totalPages,
        currentPage: result.currentPage,
      },
    });
  }

  @httpGet('/:id', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getProduct(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') id: string
  ) {
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Seller account required');
    }

    const product = await this.productService.getSellerOwnedProduct(id, sellerId.toString());
    return this.sendResponse(res, 200, 'Product retrieved successfully', product);
  }

  @httpPost('/', TYPES.RequireSignIn, TYPES.RequireSeller)
  async createProduct(@response() res: Response, @requestBody() payload: any, @request() req: Request) {
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Seller account required');
    }

    let newProduct;
    const productType = payload.productType || payload.product?.productType || 'simple';

    if (productType === 'variable') {
      const productPayload = payload.product || payload;
      productPayload.owner = sellerId;
      newProduct = await this.productService.createVariableProduct({
        ...payload,
        product: productPayload,
        owner: sellerId,
      });
    } else {
      const body = payload.product || payload;
      body.owner = sellerId;
      body.productType = 'simple';
      newProduct = await this.productService.createSimpleProduct(body);
    }

    return this.sendResponse(res, 201, 'Product created successfully', newProduct);
  }

  @httpPut('/:id', TYPES.RequireSignIn, TYPES.RequireSeller)
  async updateProduct(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') id: string,
    @requestBody() payload: any
  ) {
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Seller account required');
    }

    const updated = await this.productService.updateProductWithVariants(
      id,
      sellerId.toString(),
      payload
    );
    return this.sendResponse(res, 200, 'Product updated successfully', updated);
  }

  @httpDelete('/:id', TYPES.RequireSignIn, TYPES.RequireSeller)
  async deleteProduct(
    @response() res: Response,
    @request() req: Request,
    @requestParam('id') id: string
  ) {
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      return this.sendResponse(res, 403, 'Seller account required');
    }

    await this.productService.getSellerOwnedProduct(id, sellerId.toString());
    await this.productService.deleteProduct(id);
    return this.sendResponse(res, 204, 'Product deleted successfully');
  }
}
