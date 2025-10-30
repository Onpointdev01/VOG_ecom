import { Schema, Document, Model, model } from 'mongoose';
import constants from '../utils/constants';

const { SHIPPING_ZONE } = constants.mongooseModels;

export interface IShippingZone extends Document {
  province: string; // Province name (e.g., "Kinshasa", "Bas-Congo")
  provinceCode: string; // Province code for matching with addresses
  shippingFee: number; // Shipping cost in USD
  isActive: boolean; // Enable/disable shipping to this province
  estimatedDeliveryDays: number; // Estimated delivery time in days
  createdAt: Date;
  updatedAt: Date;
}

const shippingZoneSchema: Schema<IShippingZone> = new Schema(
  {
    province: {
      type: String,
      required: [true, 'Province name is required'],
      unique: true,
      trim: true,
    },
    provinceCode: {
      type: String,
      required: [true, 'Province code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    shippingFee: {
      type: Number,
      required: [true, 'Shipping fee is required'],
      min: [0, 'Shipping fee cannot be negative'],
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    estimatedDeliveryDays: {
      type: Number,
      required: [true, 'Estimated delivery days is required'],
      min: [1, 'Delivery days must be at least 1'],
      default: 3,
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast lookups by province code
shippingZoneSchema.index({ provinceCode: 1 });
shippingZoneSchema.index({ isActive: 1 });

// Transform _id to id for API responses
shippingZoneSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const ShippingZone: Model<IShippingZone> = model<IShippingZone>(
  SHIPPING_ZONE,
  shippingZoneSchema
);
