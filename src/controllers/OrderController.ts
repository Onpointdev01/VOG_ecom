import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPost,
  httpPut,
  httpDelete,
  requestBody,
  requestParam,
  queryParam,
  response,
} from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import { OrderService, CreateOrderRequest } from '../services/OrderService';
import { BaseController } from './BaseController';
import AppError from '../utils/errors/AppError';
// [SSE] add import
import { streamController } from '../realtime/streamController';

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

    // [SSE] generic notification (service already emits order:update)
    try {
      streamController.publishToUser(String(userId), 'notification', {
        type: 'ORDER_CREATED',
        orderId: order.id,
        total: order.finalPrice,
        status: order.orderStatus,
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}

    return this.sendResponse(res, 201, 'Order created successfully', order);
  }

  @httpGet('/', TYPES.RequireSignIn)
  public async getUserOrders(
    @response() res: Response,
    @queryParam('limit') limit?: string,
    @queryParam('status') status?: string,
    @queryParam('page') page?: string
  ) {
    const userId = res.locals.user;
    
    const options = {
      limit: limit ? parseInt(limit, 10) : undefined,
      status: status,
      page: page ? parseInt(page, 10) : 1
    };
    
    const orders = await this.orderService.getUserOrders(userId, options);
    return this.sendResponse(res, 200, 'Orders retrieved successfully', orders);
  }

  @httpGet('/:orderId', TYPES.RequireSignIn)
  public async getOrder(@response() res: Response, @requestParam('orderId') orderId: string) {
    const userId = res.locals.user;
    
    const order = await this.orderService.getOrderById(orderId);
    
    // Check if user owns the order
    if (order.user.toString() !== userId) {
      throw new AppError('Access denied', 403);
    }
    
    return this.sendResponse(res, 200, 'Order retrieved successfully', order);
  }

  @httpPut('/:orderId/status', TYPES.RequireSignIn, TYPES.RequireAdmin)
  public async updateOrderStatus(@response() res: Response, @requestParam('orderId') orderId: string, @requestBody() payload: { orderStatus: string }) {
    if (!payload.orderStatus) {
      throw new AppError('Order status is required', 400);
    }
    
    const order = await this.orderService.updateOrderStatus(orderId, payload.orderStatus);

    // [SSE] generic notification to the owner (service already emits order:update)
    try {
      streamController.publishToUser(order.user.toString(), 'notification', {
        type: 'ORDER_STATUS_CHANGED',
        orderId: order.id,
        status: order.orderStatus,
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}

    return this.sendResponse(res, 200, 'Order status updated successfully', order);
  }

  @httpPut('/:orderId/confirm', TYPES.RequireSignIn, TYPES.RequireAdmin)
  public async confirmOrder(@response() res: Response, @requestParam('orderId') orderId: string) {
    const order = await this.orderService.updateOrderStatus(orderId, 'CONFIRMED');

    // [SSE]
    try {
      streamController.publishToUser(order.user.toString(), 'notification', {
        type: 'ORDER_CONFIRMED',
        orderId: order.id,
        status: order.orderStatus,
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}

    return this.sendResponse(res, 200, 'Order confirmed successfully', order);
  }

  @httpPut('/:orderId/process', TYPES.RequireSignIn, TYPES.RequireAdmin)
  public async processOrder(@response() res: Response, @requestParam('orderId') orderId: string) {
    const order = await this.orderService.updateOrderStatus(orderId, 'PROCESSING');

    // [SSE]
    try {
      streamController.publishToUser(order.user.toString(), 'notification', {
        type: 'ORDER_PROCESSING',
        orderId: order.id,
        status: order.orderStatus,
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}

    return this.sendResponse(res, 200, 'Order processing started', order);
  }

  @httpPut('/:orderId/ship', TYPES.RequireSignIn, TYPES.RequireAdmin)
  public async shipOrder(@response() res: Response, @requestParam('orderId') orderId: string, @requestBody() payload: { trackingNumber?: string }) {
    const order = await this.orderService.shipOrder(orderId, payload.trackingNumber);

    // [SSE]
    try {
      streamController.publishToUser(order.user.toString(), 'notification', {
        type: 'ORDER_SHIPPED',
        orderId: order.id,
        status: 'OUT_FOR_DELIVERY',
        trackingNumber: payload.trackingNumber,
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}

    return this.sendResponse(res, 200, 'Order shipped successfully', order);
  }

  @httpPut('/:orderId/deliver', TYPES.RequireSignIn, TYPES.RequireAdmin)
  public async deliverOrder(@response() res: Response, @requestParam('orderId') orderId: string) {
    const order = await this.orderService.deliverOrder(orderId);

    // [SSE]
    try {
      streamController.publishToUser(order.user.toString(), 'notification', {
        type: 'ORDER_DELIVERED',
        orderId: order.id,
        status: order.orderStatus,
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}

    return this.sendResponse(res, 200, 'Order delivered successfully', order);
  }

  @httpPut('/:orderId/payment-status', TYPES.RequireSignIn, TYPES.RequireAdmin)
  public async updatePaymentStatus(@response() res: Response, @requestParam('orderId') orderId: string, @requestBody() payload: { paymentStatus: string; paymentReference?: string }) {
    if (!payload.paymentStatus) {
      throw new AppError('Payment status is required', 400);
    }
    
    const order = await this.orderService.updatePaymentStatus(orderId, payload.paymentStatus, payload.paymentReference);

    // [SSE]
    try {
      streamController.publishToUser(order.user.toString(), 'notification', {
        type: 'ORDER_PAYMENT_STATUS_CHANGED',
        orderId: order.id,
        status: order.orderStatus,
        paymentStatus: order.paymentStatus,
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}

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

    // [SSE]
    try {
      streamController.publishToUser(order.user.toString(), 'notification', {
        type: 'ORDER_CANCELLED',
        orderId: cancelledOrder.id,
        status: cancelledOrder.orderStatus,
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}

    return this.sendResponse(res, 200, 'Order cancelled successfully', cancelledOrder);
  }
}
