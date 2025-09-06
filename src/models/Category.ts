import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { CATEGORY } = constants.mongooseModels;

export interface ICategory extends Document {
  name: string;
  description: string;
  imageUrl?: string; // optionnel
  isActive: boolean;
  subcategories: string[];
  parent?: string; // pour les sous-catégories
}

const categorySchema: Schema<ICategory> = new Schema(
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
      default: undefined, // NE PAS mettre d'URL par défaut ici
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
  },
  { timestamps: true }
);

// Transform _id to id and set default image if none exists
categorySchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.imageUrl = ret.imageUrl || 'https://example.com/default-category-image.jpg';
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Category: Model<ICategory> = model<ICategory>(CATEGORY, categorySchema);
