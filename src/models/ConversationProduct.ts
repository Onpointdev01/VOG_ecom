import { Document, Model, model, PopulatedDoc, Schema } from 'mongoose';
import constants from '../utils/constants';
import { IConversation } from './Conversation';
import { IProduct } from './Product';

const { CONVERSATION_PRODUCT, CONVERSATION, PRODUCT } = constants.mongooseModels;

export interface IConversationProduct extends Document {
  conversation: PopulatedDoc<IConversation>;
  product: PopulatedDoc<IProduct>;
  attachedAt: Date;
  lastOfferAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationProductSchema = new Schema<IConversationProduct>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: CONVERSATION, required: true },
    product: { type: Schema.Types.ObjectId, ref: PRODUCT, required: true },
    attachedAt: { type: Date, default: Date.now },
    lastOfferAt: { type: Date, default: null },
  },
  { timestamps: true }
);

conversationProductSchema.index({ conversation: 1, product: 1 }, { unique: true });
conversationProductSchema.index({ conversation: 1, attachedAt: -1 });

conversationProductSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const ConversationProduct: Model<IConversationProduct> = model<IConversationProduct>(
  CONVERSATION_PRODUCT,
  conversationProductSchema
);
