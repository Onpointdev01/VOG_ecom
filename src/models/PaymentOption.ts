import { Schema, Document, model } from 'mongoose';
import constants from '../utils/constants';

export type PaymentMethodType = 'MPESA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY' | 'CASH_ON_DELIVERY';

const { PAYMENT_OPTION } = constants.mongooseModels;

export interface IPaymentOption extends Document {
  name: string;
  code: PaymentMethodType;
  logoUrl?: string;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const paymentOptionSchema: Schema<IPaymentOption> = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      enum: ['MPESA', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'CASH_ON_DELIVERY'],
      unique: true,
    },
    logoUrl: { type: String },
    isEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Transform _id to id for API responses
paymentOptionSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const PaymentOption = model<IPaymentOption>(PAYMENT_OPTION, paymentOptionSchema);
