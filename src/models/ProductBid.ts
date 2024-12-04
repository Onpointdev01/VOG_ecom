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
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  expiresAt?: Date;
  cooldownUntil?: Date;
  isWithinPriceRange: boolean;
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
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'],
      default: 'PENDING',
    },
    expiresAt: {
      type: Date,
      validate: {
        validator: function (this: IBid, value: Date) {
          // Ensure expiration is 24 hours from acceptance
          return (
            !this.expiresAt ||
            (this.status === 'ACCEPTED' && value.getTime() - this.updatedAt.getTime() <= 24 * 60 * 60 * 1000)
          );
        },
        message: 'Bid expiration must be within 24 hours of acceptance',
      },
    },
    cooldownUntil: {
      type: Date,
      default: null,
    },
    isWithinPriceRange: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Middleware to handle bid restrictions
bidSchema.pre('save', async function (next) {
  // Check for existing bids within 24 hours
  const existingBid = await this.model(BID).findOne({
    buyer: this.buyer,
    product: this.product,
    createdAt: {
      $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  });

  if (existingBid) {
    return next(new Error('Only one bid per product within 24 hours is allowed'));
  }

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

  // Check existing bids
  const existingBid = await this.model(BID).findOne({
    buyer: this.buyer,
    product: this.product,
    status: { $in: ['PENDING', 'ACCEPTED'] },
  });

  return !existingBid;
};

export const Bid: Model<IBid> = model<IBid>(BID, bidSchema);
