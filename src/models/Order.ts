import { Schema, Document, Model, model } from 'mongoose';
import { IProduct } from './Product';
import { IUser } from './User';
import { IPaymentOption, PaymentMethodType } from './PaymentOption';
import constants from '../utils/constants';

const { ORDER, PRODUCT, USER, PAYMENT_OPTION } = constants.mongooseModels;

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface IOrderItem {
  _id: string;
  product: Schema.Types.ObjectId | IProduct;
  quantity: number;
  sku?: string;
  size?: string;
  color?: string;
  price: number;
  bidId?: Schema.Types.ObjectId;
}

export interface IShippingAddress {
  fullName: string;
  phoneNumber: string;
  homeAddress: string;
  state: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface IOrder extends Document {
  user: Schema.Types.ObjectId | IUser;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  paymentMethod: PaymentMethodType;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  totalPrice: number;
  shippingFee: number;
  finalPrice: number;
  orderNumber: string;
  paymentReference?: string;
  notes?: string;
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
  state: {
    type: String,
    required: true,
    trim: true,
  },
  city: {
    type: String,
    required: true,
    trim: true,
  },
  postalCode: {
    type: String,
    required: true,
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
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
    default: 'PENDING',
  },
  orderStatus: {
    type: String,
    required: true,
    enum: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
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