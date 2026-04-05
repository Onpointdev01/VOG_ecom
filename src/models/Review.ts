import mongoose, { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';
import { Product, Seller } from '.';

const { REVIEW, USER, PRODUCT, SELLER } = constants.mongooseModels;

export interface IReview extends Document {
  _id: Schema.Types.ObjectId;
  user: Schema.Types.ObjectId;
  reviewType: string;
  rating: number;
  /** Required for product reviews; optional for store (seller) reviews */
  comment?: string;
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
reviewSchema.index({ product: 1, seller: 1, user: 1 });
/** One store review per user per seller (updates replace the same document). */
reviewSchema.index(
  { user: 1, seller: 1, reviewType: 1 },
  {
    unique: true,
    partialFilterExpression: { reviewType: 'seller', seller: { $exists: true, $ne: null } },
  }
);

reviewSchema.pre('validate', function (next) {
  if (this.reviewType === 'product' && (!this.comment || !String(this.comment).trim())) {
    this.invalidate('comment', 'Comment is required for product reviews');
  }
  next();
});

reviewSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

async function refreshProductReviewMetrics(productId: Schema.Types.ObjectId) {
  const product = await Product.findById(productId);
  if (!product) return;

  const productReviews = await Review.find({ product: productId, reviewType: 'product' }).select('_id rating');
  const totalReviews = productReviews.length;
  const totalRating = productReviews.reduce((acc, r) => acc + r.rating, 0);
  const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;

  product.reviews = productReviews.map((r) => r._id) as unknown as typeof product.reviews;
  product.noOfReviews = totalReviews;
  product.rating = averageRating;
  await product.save();
}

/** Recompute Seller.rating / noOfRating from seller-type reviews (exported for explicit calls). */
export async function refreshSellerReviewMetrics(sellerId: Schema.Types.ObjectId | string) {
  const sid =
    typeof sellerId === 'string'
      ? new mongoose.Types.ObjectId(sellerId)
      : sellerId;
  const seller = await Seller.findById(sid);
  if (!seller) return;

  const sellerReviews = await Review.find({ seller: sid, reviewType: 'seller' }).select('rating');
  const totalReviews = sellerReviews.length;
  const totalRating = sellerReviews.reduce((acc, r) => acc + r.rating, 0);
  const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;

  seller.rating = averageRating;
  seller.noOfRating = totalReviews;
  await seller.save();
}

/** After persist: recompute aggregates from DB (correct for creates and rating updates). */
reviewSchema.post('save', async function (doc: IReview) {
  try {
    if (doc.reviewType === 'product' && doc.product) {
      await refreshProductReviewMetrics(doc.product as Schema.Types.ObjectId);
    } else if (doc.reviewType === 'seller' && doc.seller) {
      await refreshSellerReviewMetrics(doc.seller as Schema.Types.ObjectId);
    }
  } catch (e) {
    console.error('[Review] post-save aggregate refresh failed:', e);
  }
});

export const Review: Model<IReview> = model<IReview>(REVIEW, reviewSchema);
