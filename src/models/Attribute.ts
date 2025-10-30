import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { ATTRIBUTE } = constants.mongooseModels;

export interface IAttribute extends Document {
  name: string;              // Internal name: "size", "color", "storage"
  displayName: string;       // Display name: "Choose Size", "Select Color"
  type: 'select' | 'color' | 'text';  // How to display in UI
  description?: string;      // Optional description for admin
  isRequired: boolean;       // Default required state
  isActive: boolean;
  displayOrder: number;      // Order in UI
  createdAt: Date;
  updatedAt: Date;
}

const attributeSchema: Schema = new Schema<IAttribute>(
  {
    name: {
      type: String,
      required: [true, 'Attribute name is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['select', 'color', 'text'],
      required: [true, 'Attribute type is required'],
      default: 'select',
    },
    description: {
      type: String,
      trim: true,
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Indexes for performance
attributeSchema.index({ isActive: 1 });
attributeSchema.index({ displayOrder: 1 });

// Transform _id to id for API responses
attributeSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Attribute: Model<IAttribute> = model<IAttribute>(ATTRIBUTE, attributeSchema);
