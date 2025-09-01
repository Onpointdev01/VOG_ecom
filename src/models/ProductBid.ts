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
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
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
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
      default: 'PENDING',
    },
    expiresAt: {
      type: Date,
      validate: {
        validator: function (this: IBid, value: Date) {
          if (!value) return true;

          // Only validate if bid is accepted
          if (this.status === 'ACCEPTED') {
            const maxExpiry = new Date(this.createdAt.getTime() + 24 * 60 * 60 * 1000);
            return value.getTime() <= maxExpiry.getTime();
          }

          return true;
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
