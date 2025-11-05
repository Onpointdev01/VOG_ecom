import { Document, Model, model, PopulatedDoc, Schema } from 'mongoose';
import constants from '../utils/constants';
import { ISeller, IProductVariant } from '.';

const { PRODUCT, SELLER, REVIEW, CATEGORY, PRODUCT_VARIANT, ATTRIBUTE, ATTRIBUTE_VALUE } = constants.mongooseModels;

export interface IProduct extends Document {
  name: string;
  description: string;
  productType: 'simple' | 'variable';
  category: Schema.Types.ObjectId;
  owner: PopulatedDoc<ISeller>;
  brand: string;
  rating: number;
  reviews: Schema.Types.ObjectId[];
  noOfReviews: number;
  isActive: boolean;
  isFlash: boolean;
  isRecommended: boolean;

  // Fields for SIMPLE products (optional for variable)
  price?: number;
  originalPrice?: number;
  condition?: 'Brand New' | 'Used' | 'Refurbished';
  color?: string;
  quantityAvailable?: number;
  images?: string[];
  attributes?: {
    attribute: Schema.Types.ObjectId;
    value: Schema.Types.ObjectId;
  }[];

  // Fields for VARIABLE products (optional for simple)
  variants?: PopulatedDoc<IProductVariant>[];

  createdAt: Date;
  updatedAt: Date;
}

const productSchema: Schema<IProduct> = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    productType: { type: String, enum: ['simple', 'variable'], required: true },
    category: { type: Schema.Types.ObjectId, ref: CATEGORY, required: true },
    owner: { type: Schema.Types.ObjectId, ref: SELLER, required: true },
    brand: { type: String, required: true, trim: true },
    rating: { type: Number, default: 0.0 },
    reviews: { type: [Schema.Types.ObjectId], ref: REVIEW },
    noOfReviews: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isFlash: { type: Boolean, default: false },

    // Fields primarily for SIMPLE products
    price: { type: Number, min: 0 },
    originalPrice: { type: Number, min: 0 },
    condition: { type: String, enum: ['Brand New', 'Used', 'Refurbished'] },
    color: { type: String },
    quantityAvailable: { type: Number, default: 0, min: 0 },
    images: { type: [String] },
    attributes: [{
      attribute: { type: Schema.Types.ObjectId, ref: ATTRIBUTE },
      value: { type: Schema.Types.ObjectId, ref: ATTRIBUTE_VALUE }
    }],

    // Fields for VARIABLE products
    variants: [{ type: Schema.Types.ObjectId, ref: PRODUCT_VARIANT }],
  },
  { timestamps: true }
);

// Validator to enforce data rules based on product type
productSchema.pre('validate', function (next) {
  if (this.productType === 'simple') {
    // Simple products must have price and quantity
    if (this.price === undefined || this.price === null) {
      this.invalidate('price', 'Simple products must have a price');
    }
    if (this.quantityAvailable === undefined || this.quantityAvailable === null) {
      this.invalidate('quantityAvailable', 'Simple products must have quantity available');
    }
    if (this.condition === undefined || this.condition === null) {
      this.invalidate('condition', 'Simple products must have a condition');
    }
    if (!this.images || this.images.length === 0) {
      this.invalidate('images', 'Simple products must have at least one image');
    }
    // Simple products should not have variants
    if (this.variants && this.variants.length > 0) {
      this.invalidate('variants', 'Simple products cannot have variants');
    }
  } else if (this.productType === 'variable') {
    // Variable products should not have top-level price/quantity
    if (this.price !== undefined && this.price !== null) {
      this.invalidate('price', 'Variable products should not have a top-level price. Define prices in variants.');
    }
    if (this.quantityAvailable !== undefined && this.quantityAvailable !== null) {
      this.invalidate('quantityAvailable', 'Variable products should not have top-level quantity. Define quantities in variants.');
    }
    // Skip variant check on creation since variants are created separately
  }
  next();
});

// Pre-save middleware to calculate total quantity and reviews
productSchema.pre('save', function (next) {
  if (this.isModified('reviews') && this.reviews.length > 0) {
    this.noOfReviews = this.reviews.length;
  }
  next();
});

// Transform _id to id for API responses
productSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

// Create text index for search functionality
productSchema.index({ 
  name: 'text', 
  description: 'text', 
  brand: 'text' 
}, {
  weights: {
    name: 10,        // Name is most important
    brand: 5,        // Brand is moderately important  
    description: 1   // Description is least important
  },
  name: 'product_text_index'
});

export const Product: Model<IProduct> = model<IProduct>(PRODUCT, productSchema);
