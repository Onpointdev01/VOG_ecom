import { Document, Model, model, PopulatedDoc, Schema } from 'mongoose';
import constants from '../utils/constants';
import { ISeller, IProductVariant } from '.';
import type { ProductAvailabilityStatus } from '../utils/productAvailability';

const { PRODUCT, SELLER, REVIEW, CATEGORY, PRODUCT_VARIANT, ATTRIBUTE, ATTRIBUTE_VALUE } = constants.mongooseModels;

export const PRODUCT_AVAILABILITY_STATUSES: ProductAvailabilityStatus[] = [
  'ACTIVE',
  'OUT_OF_STOCK',
  'HIDDEN',
  'ARCHIVED',
  'DELETED',
  'INVALID',
];

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
  availabilityStatus: ProductAvailabilityStatus;
  deletedAt?: Date | null;
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

  /** Optional variant dimension config (sizes/colors toggles + option lists) */
  variantConfig?: {
    hasSizes: boolean;
    hasColors: boolean;
    sizes: string[];
    colors: string[];
  };

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
    availabilityStatus: {
      type: String,
      enum: PRODUCT_AVAILABILITY_STATUSES,
      default: 'ACTIVE',
      index: true,
    },
    deletedAt: { type: Date, default: null, index: true },
    isFlash: { type: Boolean, default: false },
    isRecommended: { type: Boolean, default: true },

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
    variantConfig: {
      hasSizes: { type: Boolean, default: false },
      hasColors: { type: Boolean, default: false },
      sizes: { type: [String], default: [] },
      colors: { type: [String], default: [] },
    },
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

/** Keep availabilityStatus in sync with stock, isActive, and seller integrity. */
productSchema.pre('save', async function (next) {
  try {
    const ProductVariantModel = this.db.model(constants.mongooseModels.PRODUCT_VARIANT);
    const SellerModel = this.db.model(constants.mongooseModels.SELLER);
    const { deriveAvailabilityStatus, getTotalStock } = await import('../utils/productAvailability');

    let variants: Array<{ quantityAvailable?: number; isActive?: boolean }> = [];
    const { isVariableProductType } = await import('../utils/productAvailability');
    if (isVariableProductType(this.productType) && this._id) {
      variants = await ProductVariantModel.find({
        product: this._id,
        isActive: { $ne: false },
      })
        .select('quantityAvailable isActive')
        .lean();
    }

    const seller = this.owner
      ? await SellerModel.findById(this.owner).select('status user').lean()
      : null;

    const productPlain = {
      productType: this.productType,
      isActive: this.isActive,
      deletedAt: this.deletedAt,
      availabilityStatus: this.availabilityStatus,
      quantityAvailable: this.quantityAvailable,
      owner: this.owner,
      variants,
      totalStock: getTotalStock(
        { productType: this.productType, quantityAvailable: this.quantityAvailable },
        variants
      ),
    };

    this.availabilityStatus = deriveAvailabilityStatus({
      product: productPlain,
      seller: seller as import('../utils/productAvailability').SellerLike | null,
    });
    next();
  } catch (err) {
    next(err as Error);
  }
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
