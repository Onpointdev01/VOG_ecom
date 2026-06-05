import { Document, Model, model, PopulatedDoc, Schema } from 'mongoose';
import constants from '../utils/constants';
import { IConversation } from './Conversation';
import { IOffer } from './Offer';
import { IProduct } from './Product';
import { IUser } from './User';

const { MESSAGE, CONVERSATION, USER, PRODUCT, OFFER } = constants.mongooseModels;

export type MessageType =
  | 'TEXT'
  | 'PRODUCT_INQUIRY'
  | 'OFFER_CREATED'
  | 'OFFER_COUNTER'
  | 'OFFER_ACCEPTED'
  | 'OFFER_REJECTED'
  | 'OFFER_CANCELLED'
  | 'OFFER_EXPIRED'
  | 'SYSTEM';

export interface IMessage extends Document {
  conversation: PopulatedDoc<IConversation>;
  sender: PopulatedDoc<IUser>;
  recipient: PopulatedDoc<IUser>;
  /** Optional for general store messages */
  product?: PopulatedDoc<IProduct>;
  offer?: PopulatedDoc<IOffer>;
  type: MessageType;
  text: string;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: CONVERSATION, required: true },
    sender: { type: Schema.Types.ObjectId, ref: USER, required: true },
    recipient: { type: Schema.Types.ObjectId, ref: USER, required: true },
    product: { type: Schema.Types.ObjectId, ref: PRODUCT, default: null },
    offer: { type: Schema.Types.ObjectId, ref: OFFER, default: null },
    type: {
      type: String,
      enum: [
        'TEXT',
        'PRODUCT_INQUIRY',
        'OFFER_CREATED',
        'OFFER_COUNTER',
        'OFFER_ACCEPTED',
        'OFFER_REJECTED',
        'OFFER_CANCELLED',
        'OFFER_EXPIRED',
        'SYSTEM',
      ],
      required: true,
    },
    text: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ recipient: 1, readAt: 1 });

messageSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Message: Model<IMessage> = model<IMessage>(MESSAGE, messageSchema);
