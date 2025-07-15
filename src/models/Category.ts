import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { CATEGORY } = constants.mongooseModels;

export interface ICategory extends Document {
  name: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
  subcategories: string[]; // New field for subcategories
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
    subcategories: {
      type: [String],
      default: [],
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
