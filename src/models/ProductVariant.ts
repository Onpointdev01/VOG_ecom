import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { PRODUCT_VARIANT, PRODUCT } = constants.mongooseModels;

export interface IProductVariant extends Document {
  product: Schema.Types.ObjectId;
  sku: string;
  size: string;
  color: string;
  price: number;
  originalPrice: number;
  quantityAvailable: number;
  images: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productVariantSchema = new Schema<IProductVariant>(
  {
    product: { 
      type: Schema.Types.ObjectId, 
      ref: PRODUCT, 
      required: true, 
      index: true 
    },
    sku: { 
      type: String, 
      required: false, // Will be auto-generated if not provided
      unique: true, 
      uppercase: true, 
      trim: true 
    },
    size: { 
      type: String, 
      required: true, 
      trim: true 
    },
    color: { 
      type: String, 
      required: true, 
      trim: true 
    },
    price: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    originalPrice: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    quantityAvailable: { 
      type: Number, 
      required: true, 
      default: 0, 
      min: 0 
    },
    images: { 
      type: [String], 
      default: [] 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
  },
  { timestamps: true }
);

// Auto-generate SKU if not provided
productVariantSchema.pre('validate', async function (next) {
  if (!this.sku) {
    try {
      const productDoc = await model(PRODUCT).findById(this.product);
      if (!productDoc) {
        return next(new Error('Parent product not found for SKU generation'));
      }

      const baseCode = productDoc.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'PRD';
      const colorCode = this.color.substring(0, 2).toUpperCase().replace(/[^A-Z]/g, '') || 'COL';
      const sizeCode = this.size.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SIZ';
      const timestamp = Date.now().toString().slice(-5);
      
      this.sku = `${baseCode}-${colorCode}-${sizeCode}-${timestamp}`;
    } catch (error) {
      return next(error as Error);
    }
  }
  next();
});

// Also keep the save hook as backup
productVariantSchema.pre('save', async function (next) {
  if (!this.sku) {
    try {
      const productDoc = await model(PRODUCT).findById(this.product);
      if (!productDoc) {
        return next(new Error('Parent product not found for SKU generation'));
      }

      const baseCode = productDoc.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'PRD';
      const colorCode = this.color.substring(0, 2).toUpperCase().replace(/[^A-Z]/g, '') || 'COL';
      const sizeCode = this.size.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SIZ';
      const timestamp = Date.now().toString().slice(-5);
      
      this.sku = `${baseCode}-${colorCode}-${sizeCode}-${timestamp}`;
    } catch (error) {
      return next(error as Error);
    }
  }
  next();
});

// Create indexes for performance
productVariantSchema.index({ product: 1, isActive: 1 });
productVariantSchema.index({ product: 1, size: 1, color: 1 });
productVariantSchema.index({ sku: 1 });

// Transform _id to id for API responses
productVariantSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const ProductVariant: Model<IProductVariant> = model<IProductVariant>(PRODUCT_VARIANT, productVariantSchema);