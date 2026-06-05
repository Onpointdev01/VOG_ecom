import { Schema, Document, Model, model } from 'mongoose';
import { IProduct } from './Product';
import { IUser } from './User';
import { IPaymentOption, PaymentMethodType } from './PaymentOption';
import constants from '../utils/constants';

const { ORDER, PRODUCT, USER, PAYMENT_OPTION, PAYMENT, PRODUCT_VARIANT } = constants.mongooseModels;

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETE'
  | 'CANCELLED'
  | 'CANCELLED_BY_BUYER';
export type OrderPaymentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type OrderApprovalActor = 'ADMIN' | 'SELLER';
export type OrderCancellationActor = 'BUYER' | 'SELLER' | 'ADMIN';

export interface IOrderItem {
  _id: string;
  product: Schema.Types.ObjectId | IProduct;
  quantity: number;
  variantId?: string;
  sku?: string;
  size?: string;
  color?: string;
  price: number;
  bidId?: Schema.Types.ObjectId;
  offerId?: Schema.Types.ObjectId;
}

export interface IShippingAddress {
  fullName: string;
  phoneNumber: string;
  homeAddress: string;
  neighborhood: string;
  state?: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface IOrder extends Document {
  user: Schema.Types.ObjectId | IUser;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  paymentMethod: PaymentMethodType;
  paymentStatus: OrderPaymentStatus;
  orderStatus: OrderStatus;
  totalPrice: number;
  shippingFee: number;
  finalPrice: number;
  discountAmount?: number;
  campaignId?: Schema.Types.ObjectId;
  couponCode?: string;
  orderNumber: string;
  paymentReference?: string;
  notes?: string;
  cartItemIds?: string[]; // Store original cart item IDs for clearing

  approvedBy?: Schema.Types.ObjectId | IUser;
  approvedAt?: Date;
  approvedByActor?: OrderApprovalActor;
  rejectedBy?: Schema.Types.ObjectId | IUser;
  rejectedAt?: Date;
  rejectedByActor?: OrderApprovalActor;
  paymentMarkedPaidBy?: Schema.Types.ObjectId | IUser;
  paymentMarkedPaidAt?: Date;
  paymentMarkedPaidByActor?: OrderApprovalActor;
  cancelledAt?: Date;
  cancelledBy?: Schema.Types.ObjectId | IUser;
  cancelledByActor?: OrderCancellationActor;
  cancellationReason?: string;

  // Payment tracking
  payments: Schema.Types.ObjectId[]; // Reference to Payment documents
  activePayment?: Schema.Types.ObjectId; // Current active payment attempt
  
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema: Schema<IOrderItem> = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: PRODUCT,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  variantId: {
    type: Schema.Types.ObjectId,
    ref: PRODUCT_VARIANT,
    required: false,
  },
  sku: {
    type: String,
    required: false,
  },
  size: {
    type: String,
    required: false,
  },
  color: {
    type: String,
    required: false,
  },
  price: {
    type: Number,
    required: true,
  },
  bidId: {
    type: Schema.Types.ObjectId,
    ref: 'Bid',
    required: false,
  },
  offerId: {
    type: Schema.Types.ObjectId,
    ref: 'Offer',
    required: false,
  },
});

const shippingAddressSchema: Schema<IShippingAddress> = new Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
  },
  homeAddress: {
    type: String,
    required: true,
    trim: true,
  },
  neighborhood: {
    type: String,
    required: true,
    trim: true,
  },
  state: {
    type: String,
    trim: true,
  },
  city: {
    type: String,
    required: false,
    trim: true,
  },
  postalCode: {
    type: String,
    required: false,
    trim: true,
  },
  country: {
    type: String,
    required: true,
    trim: true,
    default: 'Congo',
  },
});

const orderSchema: Schema<IOrder> = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: USER,
    required: true,
  },
  items: [orderItemSchema],
  shippingAddress: {
    type: shippingAddressSchema,
    required: true,
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['MPESA', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'CASH_ON_DELIVERY'],
  },
  paymentStatus: {
    type: String,
    required: true,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'],
    default: 'PENDING',
  },
  orderStatus: {
    type: String,
    required: true,
    enum: [
      'PENDING',
      'CONFIRMED',
      'OUT_FOR_DELIVERY',
      'COMPLETE',
      'CANCELLED',
      'CANCELLED_BY_BUYER',
    ],
    default: 'PENDING',
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  shippingFee: {
    type: Number,
    required: true,
    default: 0,
  },
  finalPrice: {
    type: Number,
    required: true,
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  campaignId: {
    type: Schema.Types.ObjectId,
    ref: 'MarketingCampaign',
    required: false,
  },
  couponCode: {
    type: String,
    trim: true,
    uppercase: true,
    required: false,
  },
  orderNumber: {
    type: String,
    required: true,
    unique: true,
  },
  paymentReference: {
    type: String,
    required: false,
  },
  notes: {
    type: String,
    required: false,
  },
  cartItemIds: {
    type: [String],
    required: false,
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: USER,
    required: false,
  },
  approvedAt: {
    type: Date,
    required: false,
  },
  approvedByActor: {
    type: String,
    enum: ['ADMIN', 'SELLER'],
    required: false,
  },
  rejectedBy: {
    type: Schema.Types.ObjectId,
    ref: USER,
    required: false,
  },
  rejectedAt: {
    type: Date,
    required: false,
  },
  rejectedByActor: {
    type: String,
    enum: ['ADMIN', 'SELLER'],
    required: false,
  },
  paymentMarkedPaidBy: {
    type: Schema.Types.ObjectId,
    ref: USER,
    required: false,
  },
  paymentMarkedPaidAt: {
    type: Date,
    required: false,
  },
  paymentMarkedPaidByActor: {
    type: String,
    enum: ['ADMIN', 'SELLER'],
    required: false,
  },
  cancelledAt: {
    type: Date,
    required: false,
  },
  cancelledBy: {
    type: Schema.Types.ObjectId,
    ref: USER,
    required: false,
  },
  cancelledByActor: {
    type: String,
    enum: ['BUYER', 'SELLER', 'ADMIN'],
    required: false,
  },
  cancellationReason: {
    type: String,
    trim: true,
    maxlength: 500,
    required: false,
  },
  payments: [{
    type: Schema.Types.ObjectId,
    ref: PAYMENT,
  }],
  activePayment: {
    type: Schema.Types.ObjectId,
    ref: PAYMENT,
    required: false,
  },
}, { timestamps: true });

// Order number is now generated in the OrderService before saving

// Transform _id to id for API responses
orderSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// Transform _id to id for order items
orderItemSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Order: Model<IOrder> = model<IOrder>(ORDER, orderSchema);