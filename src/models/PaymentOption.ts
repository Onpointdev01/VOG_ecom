import { Schema, Document, model } from 'mongoose';
import constants from '../utils/constants';

export type PaymentMethodType = 'MPESA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY';

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
      enum: ['MPESA', 'ORANGE_MONEY', 'AIRTEL_MONEY'],
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

export const PaymentOption = model<IPaymentOption>(PAYMENT_OPTION, paymentOptionSchema);
