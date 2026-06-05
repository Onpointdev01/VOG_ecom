import { Document, Model, model, PopulatedDoc, Schema } from 'mongoose';
import constants from '../utils/constants';
import { IAdmin } from './Admin';
import { IProduct } from './Product';
import { ISeller } from './Seller';
import { IUser } from './User';

const { CONVERSATION, PRODUCT, USER, SELLER, OFFER, ADMIN } = constants.mongooseModels;

export type ConversationType = 'STORE' | 'PRODUCT' | 'ADMIN_SELLER';
export type ConversationStatus = 'OPEN' | 'CLOSED';

export interface IConversation extends Document {
  type: ConversationType;
  status: ConversationStatus;
  /** Legacy: required for type=PRODUCT threads; null for STORE threads */
  product?: PopulatedDoc<IProduct>;
  /** Default product card shown in chat sidebar */
  contextProduct?: PopulatedDoc<IProduct>;
  /** Buyer (marketplace threads only) */
  buyer?: PopulatedDoc<IUser>;
  /** Platform admin (admin ↔ seller support only) */
  admin?: PopulatedDoc<IAdmin>;
  seller: PopulatedDoc<ISeller>;
  sellerUser: PopulatedDoc<IUser>;
  participants: Schema.Types.ObjectId[];
  lastMessage: string;
  lastMessageAt: Date;
  hasActiveOffer: boolean;
  activeOffer?: Schema.Types.ObjectId;
  unreadByBuyer: number;
  unreadBySeller: number;
  unreadByAdmin: number;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ['STORE', 'PRODUCT', 'ADMIN_SELLER'],
      default: 'PRODUCT',
    },
    status: {
      type: String,
      enum: ['OPEN', 'CLOSED'],
      default: 'OPEN',
    },
    product: { type: Schema.Types.ObjectId, ref: PRODUCT, default: null },
    contextProduct: { type: Schema.Types.ObjectId, ref: PRODUCT, default: null },
    buyer: { type: Schema.Types.ObjectId, ref: USER, default: null },
    admin: { type: Schema.Types.ObjectId, ref: ADMIN, default: null },
    seller: { type: Schema.Types.ObjectId, ref: SELLER, required: true },
    sellerUser: { type: Schema.Types.ObjectId, ref: USER, required: true },
    participants: [{ type: Schema.Types.ObjectId, ref: USER, required: true }],
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
    hasActiveOffer: { type: Boolean, default: false },
    activeOffer: { type: Schema.Types.ObjectId, ref: OFFER, default: null },
    unreadByBuyer: { type: Number, default: 0 },
    unreadBySeller: { type: Number, default: 0 },
    unreadByAdmin: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Legacy product-scoped threads (kept during migration)
conversationSchema.index(
  { product: 1, buyer: 1, seller: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: 'PRODUCT',
      product: { $type: 'objectId' },
    },
  }
);

// One inbox per buyer ↔ store (Marketplace model)
conversationSchema.index(
  { buyer: 1, seller: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'STORE' },
  }
);

// One support thread per admin ↔ seller
conversationSchema.index(
  { admin: 1, seller: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'ADMIN_SELLER' },
  }
);

conversationSchema.index({ buyer: 1, lastMessageAt: -1 });
conversationSchema.index({ sellerUser: 1, lastMessageAt: -1 });
conversationSchema.index({ admin: 1, lastMessageAt: -1 });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

conversationSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Conversation: Model<IConversation> = model<IConversation>(
  CONVERSATION,
  conversationSchema
);
