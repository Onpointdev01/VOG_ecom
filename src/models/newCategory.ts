import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { CATEGORY } = constants.mongooseModels;

export interface INewCategory extends Document {
  name: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
  parent: Schema.Types.ObjectId | null;
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;
  displayOrder?: number;
}

const categorySchema: Schema = new Schema<INewCategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      default: 'https://example.com/default-category-image.jpg',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      sparse: true,
    },
    metaTitle: {
      type: String,
      trim: true,
    },
    metaDescription: {
      type: String,
      trim: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Virtual for subcategories
categorySchema.virtual('subcategories', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent',
});

// Transform _id to id for API responses and include virtuals
categorySchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});
categorySchema.set('toObject', { virtuals: true });

// Indexes for performance
categorySchema.index({ parent: 1 });
categorySchema.index({ slug: 1 }, { unique: true, sparse: true });

export const Category: Model<INewCategory> = model<INewCategory>(CATEGORY, categorySchema);
export { INewCategory as ICategory };
