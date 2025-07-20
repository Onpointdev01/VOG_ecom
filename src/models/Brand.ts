import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { BRAND } = constants.mongooseModels;

export interface IBrand extends Document {
  name: string;
  description?: string;
  logoUrl?: string;
  website?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const brandSchema: Schema = new Schema<IBrand>(
  {
    name: {
      type: String,
      required: [true, 'Brand name is required'],
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
    },
    logoUrl: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

brandSchema.index({ name: 1 }, { unique: true });

// Transform _id to id for API responses
brandSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Brand: Model<IBrand> = model<IBrand>(BRAND, brandSchema);