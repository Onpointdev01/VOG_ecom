import { Schema, Document, Model, model } from 'mongoose';
import { IOrder } from './Order';
import { IUser } from './User';
import constants from '../utils/constants';

const { PAYMENT, ORDER, USER } = constants.mongooseModels;

export type PaymentMethod = 'MPESA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY' | 'CASH_ON_DELIVERY';
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
export type PaymentType = 'PAYMENT' | 'REFUND';

export interface IPayment extends Document {
  order: Schema.Types.ObjectId | IOrder;
  user: Schema.Types.ObjectId | IUser;
  paymentMethod: PaymentMethod;
  paymentType: PaymentType;
  status: PaymentStatus;
  amount: number;
  currency: string;
  
  // Provider-specific fields
  providerTransactionId?: string;  // M-Pesa/Orange Money transaction ID
  providerReference?: string;      // Provider reference number
  phoneNumber?: string;           // Mobile money phone number
  
  // Internal tracking
  transactionId: string;          // Our internal transaction ID
  reference?: string;             // Order reference or custom reference
  
  // Payment details
  description?: string;
  metadata?: Record<string, any>; // Additional data from payment providers
  
  // Failure information
  failureReason?: string;
  failureCode?: string;
  
  // Timestamps
  attemptedAt: Date;             // When payment was attempted
  processedAt?: Date;            // When payment was processed
  completedAt?: Date;            // When payment was completed
  failedAt?: Date;               // When payment failed
  
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema: Schema<IPayment> = new Schema({
  order: {
    type: Schema.Types.ObjectId,
    ref: ORDER,
    required: true,
    index: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: USER,
    required: true,
    index: true,
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['MPESA', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'CASH_ON_DELIVERY'],
    index: true,
  },
  paymentType: {
    type: String,
    required: true,
    enum: ['PAYMENT', 'REFUND'],
    default: 'PAYMENT',
  },
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED'],
    default: 'PENDING',
    index: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    required: true,
    default: 'XAF', // Central African CFA franc
  },
  
  // Provider-specific fields
  providerTransactionId: {
    type: String,
    sparse: true,
    index: true,
  },
  providerReference: {
    type: String,
    sparse: true,
  },
  phoneNumber: {
    type: String,
    required: function(this: IPayment) {
      return ['MPESA', 'ORANGE_MONEY', 'AIRTEL_MONEY'].includes(this.paymentMethod);
    },
  },
  
  // Internal tracking
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  reference: {
    type: String,
  },
  
  // Payment details
  description: {
    type: String,
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
  
  // Failure information
  failureReason: {
    type: String,
  },
  failureCode: {
    type: String,
  },
  
  // Timestamps
  attemptedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  processedAt: {
    type: Date,
  },
  completedAt: {
    type: Date,
  },
  failedAt: {
    type: Date,
  },
}, { 
  timestamps: true,
  index: { createdAt: -1 } // Index for sorting by creation date
});

// Compound indexes for common queries
paymentSchema.index({ order: 1, paymentType: 1 });
paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ paymentMethod: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });

// Generate transaction ID before saving
paymentSchema.pre('save', async function(next) {
  if (this.isNew && !this.transactionId) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.transactionId = `PAY_${timestamp}_${random}`;
  }
  next();
});

// Update timestamps based on status changes
paymentSchema.pre('save', function(next) {
  const now = new Date();
  
  if (this.isModified('status')) {
    switch (this.status) {
      case 'PROCESSING':
        if (!this.processedAt) this.processedAt = now;
        break;
      case 'COMPLETED':
        if (!this.completedAt) this.completedAt = now;
        break;
      case 'FAILED':
        if (!this.failedAt) this.failedAt = now;
        break;
    }
  }
  
  next();
});

// Transform _id to id for API responses
paymentSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Payment: Model<IPayment> = model<IPayment>(PAYMENT, paymentSchema);