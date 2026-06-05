import { Document, Model, model, PopulatedDoc, Schema } from 'mongoose';
import constants from '../utils/constants';
import { IConversation } from './Conversation';
import { IProduct } from './Product';
import { ISeller } from './Seller';
import { IUser } from './User';

const { OFFER, CONVERSATION, PRODUCT, USER, SELLER } = constants.mongooseModels;

export type OfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'CONVERTED';

export type OfferInitiator = 'BUYER' | 'SELLER';

export interface IOffer extends Document {
  conversation: PopulatedDoc<IConversation>;
  product: PopulatedDoc<IProduct>;
  buyer: PopulatedDoc<IUser>;
  seller: PopulatedDoc<ISeller>;
  sellerUser: PopulatedDoc<IUser>;
  amount: number;
  finalPrice?: number;
  quantity: number;
  currency: string;
  /** Previous offer in a counter-offer chain */
  parentOffer?: PopulatedDoc<IOffer>;
  initiatedBy: OfferInitiator;
  status: OfferStatus;
  expiresAt?: Date;
  acceptedAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
  convertedAt?: Date;
  checkoutReservedUntil?: Date;
  cooldownUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const offerSchema = new Schema<IOffer>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: CONVERSATION, required: true },
    product: { type: Schema.Types.ObjectId, ref: PRODUCT, required: true },
    buyer: { type: Schema.Types.ObjectId, ref: USER, required: true },
    seller: { type: Schema.Types.ObjectId, ref: SELLER, required: true },
    sellerUser: { type: Schema.Types.ObjectId, ref: USER, required: true },
    amount: { type: Number, required: true, min: 0 },
    finalPrice: { type: Number, default: null },
    quantity: { type: Number, default: 1, min: 1 },
    currency: { type: String, default: 'USD' },
    parentOffer: { type: Schema.Types.ObjectId, ref: OFFER, default: null },
    initiatedBy: {
      type: String,
      enum: ['BUYER', 'SELLER'],
      default: 'BUYER',
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'CONVERTED'],
      default: 'PENDING',
    },
    expiresAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    convertedAt: { type: Date, default: null },
    checkoutReservedUntil: { type: Date, default: null },
    cooldownUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

offerSchema.index({ buyer: 1, product: 1, status: 1 });
offerSchema.index({ seller: 1, status: 1 });
offerSchema.index({ conversation: 1, status: 1 });
offerSchema.index({ status: 1, expiresAt: 1 });

offerSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Offer: Model<IOffer> = model<IOffer>(OFFER, offerSchema);
