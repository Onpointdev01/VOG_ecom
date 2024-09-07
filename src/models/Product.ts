import { Document, Model, model, PopulatedDoc, Schema } from 'mongoose';
import constants from '../utils/constants';
import { ISeller } from '.';

const { PRODUCT, SELLER, REVIEW, CATEGORY } = constants.mongooseModels;

export interface IProduct extends Document {
  name: string;
  description: string;
  price: number;
  originalPrice: number;
  rating: number;
  category: Schema.Types.ObjectId;
  reviews: Schema.Types.ObjectId[];
  noOfReviews: number;
  brand: string;
  condition: string;
  sizes: string[];
  color: string;
  quantityAvailable: number;
  images: string[];
  owner: PopulatedDoc<ISeller>;
  isActive: boolean;
  isFlash: boolean;
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
    category: {
      type: Schema.Types.ObjectId,
      ref: CATEGORY,
      required: true,
    },
    reviews: {
      type: [Schema.Types.ObjectId],
      ref: REVIEW,
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
      ref: SELLER,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFlash: {
      type: Boolean,
      default: false,
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
