import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';
import { Product, Seller } from '.';

const { REVIEW, USER, PRODUCT, SELLER } = constants.mongooseModels;

export interface IReview extends Document {
  _id: Schema.Types.ObjectId;
  user: Schema.Types.ObjectId;
  reviewType: string;
  rating: number;
  comment: string;
  product: Schema.Types.ObjectId;
  seller: Schema.Types.ObjectId;
}

const reviewSchema: Schema<IReview> = new Schema<IReview>(
  {
    user: {
      type: String,
      ref: USER,
      required: true,
    },
    reviewType: {
      type: String,
      enum: ['product', 'seller'],
      required: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: PRODUCT,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: SELLER, // Reference to the Seller collection
    },
  },

  {
    timestamps: true,
    toObject: {
      transform: (doc, ret) => {
        delete ret.createdAt;
        delete ret.updatedAt;
        return ret;
      },
    },
  }
);

// Transform _id to id for API responses
reviewSchema.index({ product: 1, seller: 1, reviewer: 1 });

reviewSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

// start of pre-save hook for ratings
reviewSchema.pre('save', async function (next) {
  if (this.isModified('rating') || this.isNew) {
    await updateMetrics(this);
  }
  next();
});

//TODO: push reviews to seller and product collection
async function updateMetrics(review: IReview) {
  if (review.reviewType === 'product' && review.product) {
    const product = await Product.findById(review.product);

    if (product) {
      const existingReviews = await Review.find({ product: review.product });

      const totalReviews = existingReviews.length + 1; // Include the new review
      const totalRating = existingReviews.reduce((acc, r) => acc + r.rating, 0) + review.rating;
      const averageRating = totalRating / totalReviews;

      product.noOfReviews = totalReviews;
      product.rating = averageRating;
      product.reviews.push(review._id);
      await product.save();
    }
  } else if (review.reviewType === 'seller' && review.seller) {
    const seller = await Seller.findById(review.seller);
    if (seller) {
      const existingReviews = await Review.find({ seller: review.seller });

      const totalReviews = existingReviews.length + 1; // Include the new review
      const totalRating = existingReviews.reduce((acc, r) => acc + r.rating, 0) + review.rating;
      const averageRating = totalRating / totalReviews;

      seller.rating = totalReviews;
      seller.noOfRating = averageRating;
      // seller.reviews.push(review._id);
      await seller.save();
    }
  }
}

export const Review: Model<IReview> = model<IReview>(REVIEW, reviewSchema);
