import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { PRODUCT_VARIANT, PRODUCT, ATTRIBUTE, ATTRIBUTE_VALUE } = constants.mongooseModels;

export interface IVariantAttribute {
  attribute: Schema.Types.ObjectId;    // Reference to Attribute (e.g., "Size", "Color")
  value: Schema.Types.ObjectId;        // Reference to AttributeValue (e.g., "XL", "Red")
}

export interface IProductVariant extends Document {
  product: Schema.Types.ObjectId;
  sku: string;

  // NEW: Dynamic attributes system
  attributes: IVariantAttribute[];

  // DEPRECATED: Keep for backward compatibility during migration
  size?: string;
  color?: string;

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

    // NEW: Dynamic attributes
    attributes: [
      {
        attribute: {
          type: Schema.Types.ObjectId,
          ref: ATTRIBUTE,
          required: true,
        },
        value: {
          type: Schema.Types.ObjectId,
          ref: ATTRIBUTE_VALUE,
          required: true,
        },
      },
    ],

    // DEPRECATED: Keep for backward compatibility
    size: {
      type: String,
      required: false,  // Changed to optional
      trim: true
    },
    color: {
      type: String,
      required: false,  // Changed to optional
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
      const colorCode = this.color?.substring(0, 2).toUpperCase().replace(/[^A-Z]/g, '') || 'COL';
      const sizeCode = this.size?.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SIZ';
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
      const colorCode = this.color?.substring(0, 2).toUpperCase().replace(/[^A-Z]/g, '') || 'COL';
      const sizeCode = this.size?.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SIZ';
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