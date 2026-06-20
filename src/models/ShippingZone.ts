import { Schema, Document, Model, model } from 'mongoose';
import constants from '../utils/constants';

const { SHIPPING_ZONE } = constants.mongooseModels;

export interface IShippingZone extends Document {
  /** Quartier display name */
  name: string;
  /** Unique lookup code (derived from name) */
  code: string;
  /** City this zone belongs to (e.g. "Lubumbashi") */
  city: string;
  /** Province/state this zone belongs to (e.g. "Haut-Katanga") */
  province: string;
  shippingFee: number;
  isActive: boolean;
  estimatedDeliveryDays: number;
  createdAt: Date;
  updatedAt: Date;
}

const shippingZoneSchema: Schema<IShippingZone> = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Neighborhood name is required'],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Neighborhood code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    province: {
      type: String,
      required: [true, 'Province is required'],
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

shippingZoneSchema.index({ code: 1 });
shippingZoneSchema.index({ isActive: 1 });

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
