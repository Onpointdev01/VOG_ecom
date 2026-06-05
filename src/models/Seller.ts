import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { SELLER, USER } = constants.mongooseModels;

export interface ISeller extends Document {
  user: Schema.Types.ObjectId;
  type: string;
  name: string;
  logo: string;
  noOfRating: number;
  rating: number;
  official: boolean;
  status: string;
  products: Schema.Types.ObjectId[];
  /** Always first on marketplace feed (platform / admin store) */
  isPinned: boolean;
  isPlatformStore: boolean;
  /** Admin-enabled promotion subscription */
  promotionActive: boolean;
  promotionStartsAt?: Date;
  promotionExpiresAt?: Date;
  /** Used to sort promoted boutiques (most recent activation first) */
  promotionActivatedAt?: Date;
  /** Extensible tier for future promotion levels (1 = default) */
  promotionTier: number;
  createdAt: Date;
  updatedAt: Date;
}

const sellerSchema: Schema<ISeller> = new Schema<ISeller>(
  {
    user: { type: Schema.Types.ObjectId, ref: USER, required: true },
    type: { type: String, enum: ['individual', 'company'], required: true },
    name: { type: String, required: true },
    logo: { type: String, default: '' },
    noOfRating: { type: Number, default: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    official: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'suspended', ''], default: 'active' },
    products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    isPinned: { type: Boolean, default: false },
    isPlatformStore: { type: Boolean, default: false },
    promotionActive: { type: Boolean, default: false },
    promotionStartsAt: { type: Date },
    promotionExpiresAt: { type: Date },
    promotionActivatedAt: { type: Date },
    promotionTier: { type: Number, default: 1, min: 1 },
  },
  {
    timestamps: true,
  }
);

sellerSchema.index({ isPinned: 1 });
sellerSchema.index({ promotionActive: 1, promotionExpiresAt: 1 });

sellerSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Seller: Model<ISeller> = model<ISeller>(SELLER, sellerSchema);
