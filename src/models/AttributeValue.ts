import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { ATTRIBUTE_VALUE, ATTRIBUTE } = constants.mongooseModels;

export interface IAttributeValue extends Document {
  attribute: Schema.Types.ObjectId;  // Reference to Attribute
  value: string;                     // "XL", "Red", "128GB", "Leather"
  displayOrder: number;              // For sorting in UI
  colorHex?: string;                 // For color type attributes (#FF0000)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const attributeValueSchema: Schema = new Schema<IAttributeValue>(
  {
    attribute: {
      type: Schema.Types.ObjectId,
      ref: ATTRIBUTE,
      required: [true, 'Attribute reference is required'],
      index: true,
    },
    value: {
      type: String,
      required: [true, 'Value is required'],
      trim: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    colorHex: {
      type: String,
      trim: true,
      validate: {
        validator: function(v: string) {
          // Validate hex color format if provided
          return !v || /^#[0-9A-Fa-f]{6}$/.test(v);
        },
        message: 'Invalid hex color format. Use format: #RRGGBB',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Compound index to ensure unique values per attribute
attributeValueSchema.index({ attribute: 1, value: 1 }, { unique: true });

// Indexes for performance
attributeValueSchema.index({ attribute: 1, isActive: 1 });
attributeValueSchema.index({ attribute: 1, displayOrder: 1 });

// Transform _id to id for API responses
attributeValueSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const AttributeValue: Model<IAttributeValue> = model<IAttributeValue>(
  ATTRIBUTE_VALUE,
  attributeValueSchema
);
