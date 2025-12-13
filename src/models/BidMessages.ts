import { model, Model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { BIDMESSAGES, PRODUCT, BID, USER } = constants.mongooseModels;

export interface IBidMessages extends Document {
  sender: Schema.Types.ObjectId;
  recipient: Schema.Types.ObjectId;
  product: Schema.Types.ObjectId;
  bid?: Schema.Types.ObjectId;
  type: 'BID_PROPOSAL' | 'BID_ACCEPTED' | 'BID_REJECTED' | 'SYSTEM' | 'PRODUCT_INQUIRY' | 'COUNTER_OFFER';
  message: string;
  attachments?: string[]; // Array of attachment URLs
  is_deleted: boolean;
  deleted_by?: Schema.Types.ObjectId; // User who deleted (admin or owner)
  deleted_at?: Date;
  createdAt: Date;
  updatedAt: Date;
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
      enum: ['BID_PROPOSAL', 'BID_ACCEPTED', 'BID_REJECTED', 'SYSTEM', 'PRODUCT_INQUIRY', 'COUNTER_OFFER'],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    attachments: {
      type: [String],
      default: [],
    },
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deleted_by: {
      type: Schema.Types.ObjectId,
      ref: USER,
      default: null,
    },
    deleted_at: {
      type: Date,
      default: null,
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
