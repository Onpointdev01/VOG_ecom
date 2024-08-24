import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { PRODUCT } = constants.mongooseModels;

export interface IProduct extends Document {
  name: string;
  description: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviews: Schema.Types.ObjectId[];
  noOfReviews: number;
  brand: string;
  condition: string;
  sizes: string[];
  color: string;
  quantityAvailable: number;
  images: string[];
  owner: Schema.Types.ObjectId;
  isActive: boolean;
}

const productSchema: Schema<IProduct> = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    originalPrice: {
      type: Number,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      default: 0.0,
    },
    reviews: {
      type: [Schema.Types.ObjectId],
      ref: 'Review',
    },
    noOfReviews: {
      type: Number,
      default: 0,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
    },
    condition: {
      type: String,
      required: true,
      enum: ['Brand New', 'Used', 'Refurbished'],
    },
    sizes: {
      type: [String],
      required: true,
    },
    color: {
      type: String,
      required: true,
    },
    quantityAvailable: {
      type: Number,
      required: true,
      default: 0,
    },
    images: {
      type: [String],
      required: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

productSchema.pre('save', function (next) {
  if (this.isModified('reviews') && this.reviews.length > 0) {
    this.noOfReviews = this.reviews.length;
  }
  next();
});
export const Product: Model<IProduct> = model<IProduct>(PRODUCT, productSchema);
