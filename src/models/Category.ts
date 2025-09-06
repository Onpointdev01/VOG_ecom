import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { CATEGORY } = constants.mongooseModels;

export interface ICategory extends Document {
  name: string;
  description: string;
  imageUrl?: string;
  isActive: boolean;
  subcategories: string[];
  parent?: string | null;
  displayOrder?: number;
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
      required: false,
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
    parent: {
      type: Schema.Types.ObjectId,
      ref: CATEGORY,
      default: null,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Transform _id to id and prevent default override
categorySchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;

    // Si imageUrl est vide ou null, utiliser le default
    if (!ret.imageUrl) ret.imageUrl = 'https://example.com/default-category-image.jpg';
    return ret;
  },
});

export const Category: Model<ICategory> = model<ICategory>(CATEGORY, categorySchema);
