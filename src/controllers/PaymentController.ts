import { controller, httpGet, httpPut } from 'inversify-express-utils';
import { Request, Response } from 'express';
import { inject } from 'inversify';
import { BaseController } from './BaseController';
import { PaymentService } from '../services/PaymentService';
import { TYPES } from '../di';
import AppError from '../utils/errors/AppError';

@controller('/admin/payments', TYPES.RequireAdmin)
export class PaymentController extends BaseController {
  constructor(
    @inject(TYPES.PaymentService) private paymentService: PaymentService
  ) {
    super();
  }

  @httpGet('/')
  async getAllPayments(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const status = req.query.status as string;
      const paymentMethod = req.query.paymentMethod as string;
      const paymentType = req.query.paymentType as string;

      // Build filter object
      const filter: any = {};
      
      if (status) {
        filter.status = status;
      }
      
      if (paymentMethod) {
        filter.paymentMethod = paymentMethod;
      }
      
      if (paymentType) {
        filter.paymentType = paymentType;
      }

      // Handle search
      if (search) {
        filter.$or = [
          { transactionId: { $regex: search, $options: 'i' } },
          { providerTransactionId: { $regex: search, $options: 'i' } },
          { providerReference: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * limit;

      const [payments, total] = await Promise.all([
        this.paymentService.getPayments(filter, { skip, limit, sort: { createdAt: -1 } }),
        this.paymentService.getPaymentsCount(filter)
      ]);

      const totalPages = Math.ceil(total / limit);

      return this.sendResponse(res, 200, 'Payments retrieved successfully', {
        payments,
        total,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      });
    } catch (error) {
      console.error('Error fetching payments:', error);
      return this.sendResponse(res, 500, 'Failed to fetch payments');
    }
  }

  @httpGet('/:paymentId')
  async getPaymentById(req: Request, res: Response) {
    try {
      const { paymentId } = req.params;
      
      const payment = await this.paymentService.getPaymentById(paymentId);
      if (!payment) {
        return this.sendResponse(res, 404, 'Payment not found');
      }

      return this.sendResponse(res, 200, 'Payment retrieved successfully', payment);
    } catch (error) {
      console.error('Error fetching payment:', error);
      return this.sendResponse(res, 500, 'Failed to fetch payment');
    }
  }

  @httpGet('/stats')
  async getPaymentStats(req: Request, res: Response) {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const stats = await this.paymentService.getPaymentStats(startDate, endDate);

      return this.sendResponse(res, 200, 'Payment statistics retrieved successfully', stats);
    } catch (error) {
      console.error('Error fetching payment stats:', error);
      return this.sendResponse(res, 500, 'Failed to fetch payment statistics');
    }
  }

  @httpPut('/:paymentId/status')
  async updatePaymentStatus(req: Request, res: Response) {
    try {
      const { paymentId } = req.params;
      const { 
        status, 
        providerTransactionId, 
        providerReference, 
        failureReason, 
        failureCode,
        metadata 
      } = req.body;

      if (!status) {
        return this.sendResponse(res, 400, 'Payment status is required');
      }

      const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED'];
      if (!validStatuses.includes(status)) {
        return this.sendResponse(res, 400, 'Invalid payment status');
      }

      const updatedPayment = await this.paymentService.updatePaymentStatus({
        paymentId,
        status,
        providerTransactionId,
        providerReference,
        failureReason,
        failureCode,
        metadata
      });

      return this.sendResponse(res, 200, 'Payment status updated successfully', updatedPayment);
    } catch (error) {
      console.error('Error updating payment status:', error);
      if (error instanceof AppError) {
        return this.sendResponse(res, 400, error.message);
      }
      return this.sendResponse(res, 500, 'Failed to update payment status');
    }
  }

  @httpGet('/order/:orderId')
  async getPaymentsByOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      
      const payments = await this.paymentService.getPaymentsByOrder(orderId);

      return this.sendResponse(res, 200, 'Payments retrieved successfully', payments);
    } catch (error) {
      console.error('Error fetching payments by order:', error);
      return this.sendResponse(res, 500, 'Failed to fetch payments for order');
    }
  }
}