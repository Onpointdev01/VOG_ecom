import { Document, Model, model, PopulatedDoc, Schema } from 'mongoose';
import constants from '../utils/constants';
import { ISeller, IUser } from '.';

const { PRODUCT, SELLER, USER, BID } = constants.mongooseModels;

export interface IBid extends Document {
  _id: string;
  product: Schema.Types.ObjectId;
  buyer: PopulatedDoc<IUser>;
  seller: PopulatedDoc<ISeller>;
  bidPrice: number;
  status: 'PENDING' | 'open' | 'countered' | 'ACCEPTED' | 'REJECTED' | 'expired' | 'CANCELLED';
  expiresAt?: Date;
  cooldownUntil?: Date;
  isWithinPriceRange: boolean;
  convertedToCart?: boolean;
  convertedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bidSchema: Schema<IBid> = new Schema<IBid>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: PRODUCT,
      required: true,
    },
    buyer: {
      type: Schema.Types.ObjectId,
      ref: USER,
      required: true,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: SELLER,
      required: true,
    },
    bidPrice: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'open', 'countered', 'ACCEPTED', 'REJECTED', 'expired', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    cooldownUntil: {
      type: Date,
      default: null,
    },
    isWithinPriceRange: {
      type: Boolean,
      default: false,
    },
    convertedToCart: {
      type: Boolean,
      default: false,
    },
    convertedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Middleware to handle bid restrictions
bidSchema.pre('save', async function (next) {
  // Removed: 24-hour restriction - users can now place unlimited bids
  
  //   // Validate price range
  //   const product = await this.model(PRODUCT).findById(this.product);
  //   if (!product) {
  //     return next(new Error('Product not found'));
  //   }

  //   const lowerBound = product.price * 0.75;
  //   const upperBound = product.price * 1.25;

  //   this.isWithinPriceRange = this.bidPrice >= lowerBound && this.bidPrice <= upperBound;

  // Handle cooldown after rejection
  if (this.status === 'REJECTED') {
    this.cooldownUntil = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12-hour cooldown
  }

  next();
});

// Method to check if bid is currently allowed
bidSchema.methods.isAllowedToBid = async function () {
  // Check cooldown
  if (this.cooldownUntil && this.cooldownUntil > new Date()) {
    return false;
  }

  // Removed: Check for existing bids - users can now place unlimited bids
  // Users can have multiple pending/accepted bids on the same product

  return true;
};

// Transform _id to id for API responses
bidSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Bid: Model<IBid> = model<IBid>(BID, bidSchema);
