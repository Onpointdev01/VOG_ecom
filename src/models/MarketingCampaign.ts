import { Document, Model, Schema, model } from 'mongoose';
import constants from '../utils/constants';

const { MARKETING_CAMPAIGN, PRODUCT, CATEGORY, SELLER, ADMIN } = constants.mongooseModels;

export type CampaignType = 'announcement' | 'advertisement' | 'discount';
export type CampaignPlacement =
  | 'homepage_hero'
  | 'homepage_banner'
  | 'product_page'
  | 'category_page'
  | 'checkout'
  | 'top_bar'
  | 'popup';
export type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping' | 'none';
export type CampaignLifecycleStatus = 'active' | 'scheduled' | 'expired' | 'disabled';

export interface IMarketingCampaign extends Document {
  title: string;
  subtitle?: string;
  description?: string;
  type: CampaignType;
  placement: CampaignPlacement;
  imageUrl?: string;
  linkUrl?: string;
  targetProductId?: Schema.Types.ObjectId;
  targetCategoryId?: Schema.Types.ObjectId;
  discountType: DiscountType;
  discountValue: number;
  couponCode?: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  priority: number;
  createdBy?: Schema.Types.ObjectId;
  sellerId?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const marketingCampaignSchema = new Schema<IMarketingCampaign>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subtitle: { type: String, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 2000 },
    type: {
      type: String,
      enum: ['announcement', 'advertisement', 'discount'],
      required: true,
    },
    placement: {
      type: String,
      enum: [
        'homepage_hero',
        'homepage_banner',
        'product_page',
        'category_page',
        'checkout',
        'top_bar',
        'popup',
      ],
      required: true,
    },
    imageUrl: { type: String, trim: true },
    linkUrl: { type: String, trim: true },
    targetProductId: { type: Schema.Types.ObjectId, ref: PRODUCT, default: null },
    targetCategoryId: { type: Schema.Types.ObjectId, ref: CATEGORY, default: null },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed_amount', 'free_shipping', 'none'],
      default: 'none',
    },
    discountValue: { type: Number, default: 0, min: 0 },
    couponCode: { type: String, trim: true, uppercase: true, sparse: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: ADMIN, default: null },
    sellerId: { type: Schema.Types.ObjectId, ref: SELLER, default: null },
  },
  { timestamps: true }
);

marketingCampaignSchema.index({ placement: 1, isActive: 1, startDate: 1, endDate: 1 });
marketingCampaignSchema.index({ couponCode: 1 }, { sparse: true });
marketingCampaignSchema.index({ type: 1, isActive: 1 });

marketingCampaignSchema.pre('validate', function (next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    next(new Error('endDate must be on or after startDate'));
  } else {
    next();
  }
});

marketingCampaignSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const MarketingCampaign: Model<IMarketingCampaign> = model<IMarketingCampaign>(
  MARKETING_CAMPAIGN,
  marketingCampaignSchema
);
