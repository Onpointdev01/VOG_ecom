import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPut,
  queryParam,
  request,
  requestBody,
  requestParam,
  response,
} from 'inversify-express-utils';
import { Request, Response } from 'express';
import TYPES from '../di';
import { IUser } from '../models';
import { OrderService } from '../services/OrderService';
import { BaseController } from './BaseController';
import AppError from '../utils/errors/AppError';

@controller('/api/v1/seller')
export class SellerOrderController extends BaseController {
  constructor(@inject(TYPES.OrderService) private orderService: OrderService) {
    super();
  }

  private getSellerId(req: Request): string {
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      throw new AppError('Seller account required', 403);
    }
    return sellerId.toString();
  }

  @httpGet('/orders', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getSellerOrders(
    @response() res: Response,
    @request() req: Request,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('status') status?: string,
    @queryParam('search') search?: string
  ) {
    const sellerId = this.getSellerId(req);
    const result = await this.orderService.getSellerOrders(sellerId, {
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '20', 10),
      status: status || undefined,
      search: search || undefined,
    });
    return this.sendResponse(res, 200, 'Seller orders retrieved successfully', result);
  }

  @httpGet('/payments', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getSellerPaidOrders(
    @response() res: Response,
    @request() req: Request,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('search') search?: string,
    @queryParam('dateFrom') dateFrom?: string,
    @queryParam('dateTo') dateTo?: string
  ) {
    const sellerId = this.getSellerId(req);
    const result = await this.orderService.getSellerPaidOrders(sellerId, {
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '20', 10),
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
    return this.sendResponse(res, 200, 'Seller paid orders retrieved successfully', result);
  }

  @httpGet('/orders/:orderId', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getSellerOrder(
    @response() res: Response,
    @request() req: Request,
    @requestParam('orderId') orderId: string
  ) {
    const sellerId = this.getSellerId(req);
    const order = await this.orderService.getSellerOrderById(orderId, sellerId);
    return this.sendResponse(res, 200, 'Seller order retrieved successfully', order);
  }

  @httpPut('/orders/:orderId/confirm', TYPES.RequireSignIn, TYPES.RequireSeller)
  async confirmOrder(
    @response() res: Response,
    @request() req: Request,
    @requestParam('orderId') orderId: string
  ) {
    const sellerId = this.getSellerId(req);
    const order = await this.orderService.confirmOrderBySeller(orderId, sellerId);
    return this.sendResponse(res, 200, 'Order accepted successfully', order);
  }

  @httpPut('/orders/:orderId/reject', TYPES.RequireSignIn, TYPES.RequireSeller)
  async rejectOrder(
    @response() res: Response,
    @request() req: Request,
    @requestParam('orderId') orderId: string,
    @requestBody() body: { reason?: string }
  ) {
    const sellerId = this.getSellerId(req);
    const order = await this.orderService.rejectOrderBySeller(
      orderId,
      sellerId,
      body?.reason
    );
    return this.sendResponse(res, 200, 'Order refused successfully', order);
  }
}
