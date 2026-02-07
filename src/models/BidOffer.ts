import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { BID_OFFER, BID, USER } = constants.mongooseModels;

export interface IBidOffer extends Document {
  bid_id: Schema.Types.ObjectId;
  offered_by: Schema.Types.ObjectId; // Admin who made the counter-offer
  amount: number;
  message?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  expires_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bidOfferSchema: Schema<IBidOffer> = new Schema<IBidOffer>(
  {
    bid_id: {
      type: Schema.Types.ObjectId,
      ref: BID,
      required: true,
      index: true,
    },
    offered_by: {
      type: Schema.Types.ObjectId,
      ref: USER,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    message: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'],
      default: 'PENDING',
      index: true,
    },
    expires_at: {
      type: Date,
      required: false,
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
bidOfferSchema.index({ bid_id: 1, status: 1 });
bidOfferSchema.index({ status: 1, expires_at: 1 });

// Transform _id to id for API responses
bidOfferSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const BidOffer: Model<IBidOffer> = model<IBidOffer>(BID_OFFER, bidOfferSchema);

