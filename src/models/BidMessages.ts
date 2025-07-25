import { model, Model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { BIDMESSAGES, PRODUCT, BID, USER } = constants.mongooseModels;

export interface IBidMessages extends Document {
  sender: Schema.Types.ObjectId;
  recipient: Schema.Types.ObjectId;
  product: Schema.Types.ObjectId;
  bid?: Schema.Types.ObjectId;
  type: 'BID_PROPOSAL' | 'BID_ACCEPTED' | 'BID_REJECTED' | 'SYSTEM';
  message: string;
  createdAt: Date;
}

const BidMessagesSchema: Schema<IBidMessages> = new Schema<IBidMessages>(
  {
    sender: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: USER,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: USER,
    },
    product: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: PRODUCT,
    },
    bid: {
      type: Schema.Types.ObjectId,
      ref: BID,
    },
    type: {
      type: String,
      enum: ['BID_PROPOSAL', 'BID_ACCEPTED', 'BID_REJECTED', 'SYSTEM'],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// Transform _id to id for API responses
BidMessagesSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Message: Model<IBidMessages> = model<IBidMessages>(BIDMESSAGES, BidMessagesSchema);
