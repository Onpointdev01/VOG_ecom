import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { USER_VIEW, USER, PRODUCT } = constants.mongooseModels;

export interface IUserView extends Document {
  user: Schema.Types.ObjectId;
  product: Schema.Types.ObjectId;
  viewedAt: Date;
  viewCount: number; // How many times user viewed this product
  sessionId?: string; // Optional: track session-based views
}

const userViewSchema: Schema<IUserView> = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: USER,
    required: true,
  },
  product: {
    type: Schema.Types.ObjectId,
    ref: PRODUCT,
    required: true,
  },
  viewedAt: {
    type: Date,
    default: Date.now,
  },
  viewCount: {
    type: Number,
    default: 1,
    min: 1,
  },
  sessionId: {
    type: String,
    required: false,
  },
}, { timestamps: true });

// Create compound index for user + product (unique combination)
userViewSchema.index({ user: 1, product: 1 }, { unique: true });

// Index for efficient querying of user's recent views
userViewSchema.index({ user: 1, viewedAt: -1 });

// Index for product view analytics
userViewSchema.index({ product: 1, viewedAt: -1 });

// TTL index to automatically delete old views after 90 days
userViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // 90 days

// Transform _id to id for API responses
userViewSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const UserView: Model<IUserView> = model<IUserView>(USER_VIEW, userViewSchema);