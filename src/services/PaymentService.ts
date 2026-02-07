import { injectable } from 'inversify';
import { Payment, IPayment, PaymentMethod, PaymentStatus } from '../models/Payment';
import { IOrder } from '../models/Order';

export interface CreatePaymentRequest {
  orderId: string;
  userId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  phoneNumber?: string;
  description?: string;
  currency?: string;
}

export interface UpdatePaymentStatusRequest {
  paymentId: string;
  status: PaymentStatus;
  providerTransactionId?: string;
  providerReference?: string;
  failureReason?: string;
  failureCode?: string;
  metadata?: Record<string, any>;
}

@injectable()
export class PaymentService {
  async createPayment(request: CreatePaymentRequest): Promise<IPayment> {
    try {
      const payment = new Payment({
        order: request.orderId,
        user: request.userId,
        paymentMethod: request.paymentMethod,
        paymentType: 'PAYMENT',
        status: 'PENDING',
        amount: request.amount,
        currency: request.currency || 'XAF',
        phoneNumber: request.phoneNumber,
        description: request.description || `Payment for order`,
        attemptedAt: new Date(),
      });

      const savedPayment = await payment.save();
      return savedPayment;
    } catch (error) {
      throw new Error(`Failed to create payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updatePaymentStatus(request: UpdatePaymentStatusRequest): Promise<IPayment> {
    try {
      const payment = await Payment.findById(request.paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      payment.status = request.status;

      // Update relevant timestamps and fields based on status
      const now = new Date();
      switch (request.status) {
        case 'PROCESSING':
          if (!payment.processedAt) payment.processedAt = now;
          break;
        case 'COMPLETED':
          if (!payment.completedAt) payment.completedAt = now;
          if (request.providerTransactionId) payment.providerTransactionId = request.providerTransactionId;
          if (request.providerReference) payment.providerReference = request.providerReference;
          break;
        case 'FAILED':
          if (!payment.failedAt) payment.failedAt = now;
          if (request.failureReason) payment.failureReason = request.failureReason;
          if (request.failureCode) payment.failureCode = request.failureCode;
          break;
      }

      if (request.metadata) {
        payment.metadata = { ...payment.metadata, ...request.metadata };
      }

      const updatedPayment = await payment.save();

      // Update the order's payment status (and currency) to stay in sync
      await this.syncOrderPaymentStatus(payment.order.toString(), request.status, updatedPayment.currency);

      return updatedPayment;
    } catch (error) {
      throw new Error(`Failed to update payment status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async syncOrderPaymentStatus(orderId: string, paymentStatus: string, currency?: string): Promise<void> {
    try {
      const { Order } = require('../models/Order');
      const update: any = {
        paymentStatus,
        ...(paymentStatus === 'COMPLETED' && { orderStatus: 'CONFIRMED' })
      };
      if (paymentStatus === 'COMPLETED' && currency) update.currency = currency;
      await Order.findByIdAndUpdate(orderId, update);
    } catch (error) {
      console.error('Error syncing order payment status:', error);
      // Don't throw here - payment update should succeed even if sync fails
    }
  }

  async getPaymentsByOrder(orderId: string): Promise<IPayment[]> {
    try {
      return await Payment.find({ order: orderId }).sort({ createdAt: -1 });
    } catch (error) {
      throw new Error(`Failed to get payments for order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getActivePayment(orderId: string): Promise<IPayment | null> {
    try {
      return await Payment.findOne({
        order: orderId,
        status: { $in: ['PENDING', 'PROCESSING'] }
      }).sort({ createdAt: -1 });
    } catch (error) {
      throw new Error(`Failed to get active payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createRefund(originalPaymentId: string, amount?: number, reason?: string): Promise<IPayment> {
    try {
      const originalPayment = await Payment.findById(originalPaymentId);
      if (!originalPayment) {
        throw new Error('Original payment not found');
      }

      if (originalPayment.status !== 'COMPLETED') {
        throw new Error('Can only refund completed payments');
      }

      const refundAmount = amount || originalPayment.amount;
      if (refundAmount > originalPayment.amount) {
        throw new Error('Refund amount cannot exceed original payment amount');
      }

      const refundPayment = new Payment({
        order: originalPayment.order,
        user: originalPayment.user,
        paymentMethod: originalPayment.paymentMethod,
        paymentType: 'REFUND',
        status: 'COMPLETED', // Refunds are typically processed immediately
        amount: refundAmount,
        currency: originalPayment.currency,
        description: `Refund for payment ${originalPayment.transactionId}`,
        reference: originalPayment.transactionId,
        metadata: {
          originalPaymentId: originalPaymentId,
          refundReason: reason || 'Customer refund request'
        },
        completedAt: new Date(),
      });

      return await refundPayment.save();
    } catch (error) {
      throw new Error(`Failed to create refund: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create Payment documents for orders that have paymentStatus COMPLETED but no Payment record.
   * Ensures admin payments list shows all completed payments.
   */
  async ensurePaymentsForCompletedOrders(): Promise<number> {
    try {
      const { Order } = require('../models/Order');
      const orders = await Order.find({ paymentStatus: 'COMPLETED' }).lean();
      let created = 0;
      for (const order of orders) {
        const orderId = (order as any)._id?.toString();
        if (!orderId) continue;
        const existing = await Payment.countDocuments({ order: orderId });
        if (existing > 0) continue;
        const paymentMethod = (order as any).paymentMethod || 'CASH_ON_DELIVERY';
        const payment = new Payment({
          order: orderId,
          user: (order as any).user,
          paymentMethod,
          paymentType: 'PAYMENT',
          status: 'COMPLETED',
          amount: (order as any).finalPrice ?? 0,
          currency: 'XAF',
          phoneNumber: paymentMethod === 'CASH_ON_DELIVERY' ? (order as any).shippingAddress?.phoneNumber : undefined,
          description: `Payment for order ${(order as any).orderNumber || orderId}`,
          attemptedAt: (order as any).createdAt || new Date(),
          completedAt: (order as any).updatedAt || new Date(),
        });
        await payment.save();
        await Order.findByIdAndUpdate(orderId, {
          $push: { payments: payment._id },
          $set: { activePayment: payment._id, currency: payment.currency || 'XAF' },
        });
        created++;
      }
      return created;
    } catch (error) {
      console.error('ensurePaymentsForCompletedOrders error:', error);
      return 0;
    }
  }

  async getPayments(filter: any = {}, options: { skip?: number; limit?: number; sort?: any } = {}) {
    try {
      return await Payment.find(filter)
        .populate('order', 'orderNumber')
        .populate('user', 'firstName lastName email')
        .sort(options.sort || { createdAt: -1 })
        .skip(options.skip || 0)
        .limit(options.limit || 10);
    } catch (error) {
      throw new Error(`Failed to get payments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPaymentsCount(filter: any = {}): Promise<number> {
    try {
      return await Payment.countDocuments(filter);
    } catch (error) {
      throw new Error(`Failed to count payments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPaymentById(paymentId: string): Promise<IPayment | null> {
    try {
      return await Payment.findById(paymentId)
        .populate('order', 'orderNumber')
        .populate('user', 'firstName lastName email');
    } catch (error) {
      throw new Error(`Failed to get payment by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPaymentStats(startDate?: Date, endDate?: Date) {
    try {
      const matchStage: any = {
        paymentType: 'PAYMENT'
      };

      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = startDate;
        if (endDate) matchStage.createdAt.$lte = endDate;
      }

      const stats = await Payment.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalPayments: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            completedPayments: {
              $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
            },
            failedPayments: {
              $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] }
            },
            pendingPayments: {
              $sum: { $cond: [{ $in: ['$status', ['PENDING', 'PROCESSING']] }, 1, 0] }
            }
          }
        }
      ]);

      const methodStats = await Payment.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$paymentMethod',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            successCount: {
              $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
            }
          }
        }
      ]);

      return {
        overall: stats[0] || {
          totalPayments: 0,
          totalAmount: 0,
          completedPayments: 0,
          failedPayments: 0,
          pendingPayments: 0
        },
        byMethod: methodStats
      };
    } catch (error) {
      throw new Error(`Failed to get payment stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}