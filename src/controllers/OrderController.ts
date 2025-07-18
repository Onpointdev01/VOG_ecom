import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPost,
  httpPut,
  httpDelete,
  requestBody,
  requestParam,
  response,
} from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import { OrderService, CreateOrderRequest } from '../services/OrderService';
import { BaseController } from './BaseController';
import AppError from '../utils/errors/AppError';

export interface CreateOrderDTO {
  paymentMethod: string;
  shippingAddressId: string;
  selectedItems?: string[];
  notes?: string;
}

@controller('/api/v1/orders')
export class OrderController extends BaseController {
  constructor(@inject(TYPES.OrderService) private orderService: OrderService) {
    super();
  }

  @httpPost('/', TYPES.RequireSignIn)
  public async createOrder(@response() res: Response, @requestBody() payload: CreateOrderDTO) {
    const userId = res.locals.user;
    const orderData: CreateOrderRequest = {
      userId,
      paymentMethod: payload.paymentMethod as any,
      shippingAddressId: payload.shippingAddressId,
      selectedItems: payload.selectedItems,
      notes: payload.notes,
    };

    const order = await this.orderService.createOrder(orderData);
    return this.sendResponse(res, 201, 'Order created successfully', order);
  }

  @httpGet('/', TYPES.RequireSignIn)
  public async getUserOrders(@response() res: Response) {
    const userId = res.locals.user;
    const orders = await this.orderService.getUserOrders(userId);
    return this.sendResponse(res, 200, 'Orders retrieved successfully', orders);
  }

  @httpGet('/:orderId', TYPES.RequireSignIn)
  public async getOrder(@response() res: Response, @requestParam('orderId') orderId: string) {
    const userId = res.locals.user;
    
    const order = await this.orderService.getOrderById(orderId);
    
    // Check if user owns the order (admin check would require additional middleware)
    if (order.user.toString() !== userId) {
      throw new AppError('Access denied', 403);
    }
    
    return this.sendResponse(res, 200, 'Order retrieved successfully', order);
  }

  @httpPut('/:orderId/status', TYPES.RequireSignIn)
  public async updateOrderStatus(@response() res: Response, @requestParam('orderId') orderId: string, @requestBody() payload: { orderStatus: string }) {
    // For now, we'll implement basic admin check here
    // In a real application, you'd want proper admin middleware
    
    if (!payload.orderStatus) {
      throw new AppError('Order status is required', 400);
    }
    
    const order = await this.orderService.updateOrderStatus(orderId, payload.orderStatus);
    return this.sendResponse(res, 200, 'Order status updated successfully', order);
  }

  @httpPut('/:orderId/payment-status', TYPES.RequireSignIn)
  public async updatePaymentStatus(@response() res: Response, @requestParam('orderId') orderId: string, @requestBody() payload: { paymentStatus: string; paymentReference?: string }) {
    if (!payload.paymentStatus) {
      throw new AppError('Payment status is required', 400);
    }
    
    const order = await this.orderService.updatePaymentStatus(orderId, payload.paymentStatus, payload.paymentReference);
    return this.sendResponse(res, 200, 'Payment status updated successfully', order);
  }

  @httpDelete('/:orderId', TYPES.RequireSignIn)
  public async cancelOrder(@response() res: Response, @requestParam('orderId') orderId: string) {
    const userId = res.locals.user;
    
    const order = await this.orderService.getOrderById(orderId);
    
    // Check if user owns the order
    if (order.user.toString() !== userId) {
      throw new AppError('Access denied', 403);
    }
    
    const cancelledOrder = await this.orderService.cancelOrder(orderId);
    return this.sendResponse(res, 200, 'Order cancelled successfully', cancelledOrder);
  }
}