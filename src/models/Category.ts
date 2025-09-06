import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { CATEGORY } = constants.mongooseModels;

export interface ICategory extends Document {
  name: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
  parent?: string; // Parent category reference (optional)
}

const categorySchema: Schema = new Schema<ICategory>(
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
      ref: CATEGORY,
      default: null,
    },
  },
  { timestamps: true }
);

// Transform _id to id for API responses
categorySchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Category: Model<ICategory> = model<ICategory>(CATEGORY, categorySchema);
