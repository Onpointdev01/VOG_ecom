import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { PAYOUT, SELLER, ORDER } = constants.mongooseModels;

export interface IPayout extends Document {
  seller_id: Schema.Types.ObjectId;
  order_id: Schema.Types.ObjectId;
  order_item_id?: Schema.Types.ObjectId; // Specific item if order has multiple sellers
  product_variant_id?: Schema.Types.ObjectId;
  amount_paid: number;
  payout_date: Date;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  payment_reference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const payoutSchema: Schema<IPayout> = new Schema<IPayout>(
  {
    seller_id: {
      type: Schema.Types.ObjectId,
      ref: SELLER,
      required: true,
      index: true,
    },
    order_id: {
      type: Schema.Types.ObjectId,
      ref: ORDER,
      required: true,
      index: true,
    },
    order_item_id: {
      type: Schema.Types.ObjectId,
      required: false,
    },
    product_variant_id: {
      type: Schema.Types.ObjectId,
      required: false,
    },
    amount_paid: {
      type: Number,
      required: true,
      min: 0,
    },
    payout_date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    payment_reference: {
      type: String,
      required: false,
    },
    notes: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
payoutSchema.index({ seller_id: 1, payout_date: -1 });
payoutSchema.index({ order_id: 1 });
payoutSchema.index({ status: 1, payout_date: -1 });

// Transform _id to id for API responses
payoutSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Payout: Model<IPayout> = model<IPayout>(PAYOUT, payoutSchema);

