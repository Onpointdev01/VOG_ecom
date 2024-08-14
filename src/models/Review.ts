import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { REVIEW } = constants.mongooseModels;

export interface IReview extends Document {
  product: Schema.Types.ObjectId;
  user: Schema.Types.ObjectId;
  rating: number;
  reviewText: string;
  reviewDate: Date;
}

const reviewSchema: Schema<IReview> = new Schema<IReview>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    user: {
      type: String,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reviewText: {
      type: String,
      required: true,
      trim: true,
    },
    reviewDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export const Review: Model<IReview> = model<IReview>(REVIEW, reviewSchema);
