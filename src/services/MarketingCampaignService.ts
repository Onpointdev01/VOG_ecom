import { injectable, inject } from 'inversify';
import { FilterQuery, Model } from 'mongoose';
import { BaseService } from './BaseService';
import TYPES from '../di';
import {
  CampaignLifecycleStatus,
  CampaignPlacement,
  CampaignType,
  DiscountType,
  IMarketingCampaign,
  MarketingCampaign,
} from '../models/MarketingCampaign';
import { Cart } from '../models/Cart';
import { Address } from '../models/Address';
import { IShippingZoneService } from './ShippingZoneService';
import AppError from '../utils/errors/AppError';

export interface CreateMarketingCampaignDTO {
  title: string;
  subtitle?: string;
  description?: string;
  type: CampaignType;
  placement: CampaignPlacement;
  imageUrl?: string;
  linkUrl?: string;
  targetProductId?: string;
  targetCategoryId?: string;
  discountType?: DiscountType;
  discountValue?: number;
  couponCode?: string;
  startDate: string | Date;
  endDate: string | Date;
  isActive?: boolean;
  priority?: number;
  sellerId?: string;
}

export type UpdateMarketingCampaignDTO = Partial<CreateMarketingCampaignDTO>;

export interface CampaignPublicView {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  type: CampaignType;
  placement: CampaignPlacement;
  imageUrl?: string;
  linkUrl?: string;
  targetProductId?: string;
  targetCategoryId?: string;
  discountType: DiscountType;
  discountValue: number;
  couponCode?: string;
  startDate: Date;
  endDate: Date;
  priority: number;
}

export interface CampaignAdminView {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  type: CampaignType;
  placement: CampaignPlacement;
  imageUrl?: string;
  linkUrl?: string;
  targetProductId?: string;
  targetCategoryId?: string;
  discountType: DiscountType;
  discountValue: number;
  couponCode?: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  priority: number;
  createdBy?: string;
  sellerId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  status: CampaignLifecycleStatus;
}

export interface CouponValidationResult {
  valid: boolean;
  campaign?: CampaignPublicView;
  discountAmount: number;
  subtotal: number;
  shippingFee: number;
  finalPrice: number;
  message?: string;
}

export interface IMarketingCampaignService {
  createCampaign(adminId: string, payload: CreateMarketingCampaignDTO): Promise<IMarketingCampaign>;
  updateCampaign(id: string, payload: UpdateMarketingCampaignDTO): Promise<IMarketingCampaign>;
  deleteCampaign(id: string): Promise<void>;
  getCampaignById(id: string): Promise<CampaignAdminView>;
  listCampaigns(filter?: { status?: CampaignLifecycleStatus }): Promise<CampaignAdminView[]>;
  setActive(id: string, isActive: boolean): Promise<IMarketingCampaign>;
  getActiveByPlacement(
    placement: CampaignPlacement,
    options?: { productId?: string; categoryId?: string }
  ): Promise<CampaignPublicView[]>;
  getActiveCampaigns(options?: {
    placement?: CampaignPlacement;
    type?: CampaignType;
    productId?: string;
    categoryId?: string;
  }): Promise<CampaignPublicView[]>;
  validateCouponForUser(
    userId: string,
    couponCode: string,
    shippingAddressId: string,
    selectedItems?: string[]
  ): Promise<CouponValidationResult>;
  resolveCouponForOrder(
    userId: string,
    couponCode: string | undefined,
    subtotal: number,
    shippingFee: number
  ): Promise<{ discountAmount: number; campaignId?: string; couponCode?: string }>;
}

export function getCampaignLifecycleStatus(
  campaign: { isActive: boolean; startDate: Date; endDate: Date },
  now: Date = new Date()
): CampaignLifecycleStatus {
  if (!campaign.isActive) return 'disabled';
  if (now < new Date(campaign.startDate)) return 'scheduled';
  if (now > new Date(campaign.endDate)) return 'expired';
  return 'active';
}

function buildRuntimeActiveFilter(now: Date = new Date()): FilterQuery<IMarketingCampaign> {
  return {
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  };
}

function toPublicView(doc: IMarketingCampaign): CampaignPublicView {
  const json = doc.toJSON ? doc.toJSON() : (doc as any);
  return {
    id: String(json.id || json._id),
    title: json.title,
    subtitle: json.subtitle,
    description: json.description,
    type: json.type,
    placement: json.placement,
    imageUrl: json.imageUrl,
    linkUrl: json.linkUrl,
    targetProductId: json.targetProductId ? String(json.targetProductId) : undefined,
    targetCategoryId: json.targetCategoryId ? String(json.targetCategoryId) : undefined,
    discountType: json.discountType || 'none',
    discountValue: Number(json.discountValue || 0),
    couponCode: json.couponCode,
    startDate: json.startDate,
    endDate: json.endDate,
    priority: json.priority ?? 0,
  };
}

@injectable()
export class MarketingCampaignService extends BaseService implements IMarketingCampaignService {
  constructor(
    @inject(TYPES.MarketingCampaign) private Campaign: Model<IMarketingCampaign>,
    @inject(TYPES.ShippingZoneService) private shippingZoneService: IShippingZoneService
  ) {
    super();
  }

  private normalizePayload(payload: CreateMarketingCampaignDTO | UpdateMarketingCampaignDTO) {
    const startDate = payload.startDate ? new Date(payload.startDate) : undefined;
    const endDate = payload.endDate ? new Date(payload.endDate) : undefined;
    if (startDate && endDate && endDate < startDate) {
      throw new AppError('End date must be after start date', 400);
    }
    const normalized: Record<string, unknown> = { ...payload };
    if (startDate) normalized.startDate = startDate;
    if (endDate) normalized.endDate = endDate;
    if (payload.couponCode !== undefined) {
      normalized.couponCode = payload.couponCode.trim()
        ? payload.couponCode.trim().toUpperCase()
        : undefined;
    }
    return normalized as UpdateMarketingCampaignDTO;
  }

  private toAdminView(campaign: IMarketingCampaign | Record<string, unknown>): CampaignAdminView {
    const obj = (campaign as IMarketingCampaign).toObject
      ? (campaign as IMarketingCampaign).toObject()
      : campaign;
    const doc = obj as IMarketingCampaign & { _id?: unknown };
    return {
      id: String((obj as { id?: string }).id || doc._id),
      title: doc.title,
      subtitle: doc.subtitle,
      description: doc.description,
      type: doc.type,
      placement: doc.placement,
      imageUrl: doc.imageUrl,
      linkUrl: doc.linkUrl,
      targetProductId: doc.targetProductId ? String(doc.targetProductId) : undefined,
      targetCategoryId: doc.targetCategoryId ? String(doc.targetCategoryId) : undefined,
      discountType: doc.discountType || 'none',
      discountValue: Number(doc.discountValue || 0),
      couponCode: doc.couponCode,
      startDate: doc.startDate,
      endDate: doc.endDate,
      isActive: doc.isActive,
      priority: doc.priority ?? 0,
      createdBy: doc.createdBy ? String(doc.createdBy) : undefined,
      sellerId: doc.sellerId ? String(doc.sellerId) : undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      status: getCampaignLifecycleStatus(doc),
    };
  }

  async createCampaign(
    adminId: string,
    payload: CreateMarketingCampaignDTO
  ): Promise<IMarketingCampaign> {
    const data = this.normalizePayload(payload);
    if (data.type === 'discount' && data.discountType === 'none') {
      throw new AppError('Discount campaigns require a discount type', 400);
    }
    if (data.couponCode) {
      const existing = await this.Campaign.findOne({ couponCode: data.couponCode });
      if (existing) throw new AppError('Coupon code already exists', 400);
    }
    const created = await this.Campaign.create({
      ...data,
      createdBy: adminId,
      discountType: data.discountType || 'none',
      discountValue: data.discountValue ?? 0,
      isActive: data.isActive ?? true,
      priority: data.priority ?? 0,
    });
    return created;
  }

  async updateCampaign(id: string, payload: UpdateMarketingCampaignDTO): Promise<IMarketingCampaign> {
    await this.verifyDoc(id, this.Campaign);
    const data = this.normalizePayload(payload);
    if (data.couponCode) {
      const existing = await this.Campaign.findOne({
        couponCode: data.couponCode,
        _id: { $ne: id },
      });
      if (existing) throw new AppError('Coupon code already exists', 400);
    }
    const updated = await this.Campaign.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
    if (!updated) throw new AppError('Campaign not found', 404);
    return updated;
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.verifyDoc(id, this.Campaign);
    await this.Campaign.findByIdAndDelete(id);
  }

  async getCampaignById(id: string): Promise<CampaignAdminView> {
    const campaign = await this.verifyDoc(id, this.Campaign);
    return this.toAdminView(campaign);
  }

  async listCampaigns(filter?: { status?: CampaignLifecycleStatus }): Promise<CampaignAdminView[]> {
    const campaigns = await this.Campaign.find().sort({ priority: -1, createdAt: -1 });
    const withStatuses = campaigns.map((c) => this.toAdminView(c));
    if (!filter?.status) return withStatuses;
    return withStatuses.filter((c) => c.status === filter.status);
  }

  async setActive(id: string, isActive: boolean): Promise<IMarketingCampaign> {
    await this.verifyDoc(id, this.Campaign);
    const updated = await this.Campaign.findByIdAndUpdate(
      id,
      { isActive },
      { new: true, runValidators: true }
    );
    if (!updated) throw new AppError('Campaign not found', 404);
    return updated;
  }

  async getActiveByPlacement(
    placement: CampaignPlacement,
    options?: { productId?: string; categoryId?: string }
  ): Promise<CampaignPublicView[]> {
    return this.getActiveCampaigns({ placement, ...options });
  }

  async getActiveCampaigns(options?: {
    placement?: CampaignPlacement;
    type?: CampaignType;
    productId?: string;
    categoryId?: string;
  }): Promise<CampaignPublicView[]> {
    const now = new Date();
    const filter: FilterQuery<IMarketingCampaign> = buildRuntimeActiveFilter(now);
    if (options?.placement) filter.placement = options.placement;
    if (options?.type) filter.type = options.type;

    const campaigns = await this.Campaign.find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .exec();

    return campaigns
      .filter((c) => {
        const productTarget = c.targetProductId ? String(c.targetProductId) : null;
        const categoryTarget = c.targetCategoryId ? String(c.targetCategoryId) : null;

        if (options?.productId) {
          if (productTarget && productTarget !== options.productId) return false;
        } else if (productTarget) {
          return false;
        }

        if (options?.categoryId) {
          if (categoryTarget && categoryTarget !== options.categoryId) return false;
        } else if (categoryTarget && !options?.productId) {
          return false;
        }

        return true;
      })
      .map(toPublicView);
  }

  calculateDiscountAmount(
    campaign: IMarketingCampaign | CampaignPublicView,
    subtotal: number,
    shippingFee: number
  ): number {
    const type = campaign.discountType || 'none';
    const value = Number(campaign.discountValue || 0);
    if (type === 'none' || value <= 0) return 0;
    if (type === 'percentage') {
      return Math.min(subtotal, Math.round((subtotal * value) / 100 * 100) / 100);
    }
    if (type === 'fixed_amount') {
      return Math.min(subtotal, value);
    }
    if (type === 'free_shipping') {
      return Math.min(shippingFee, shippingFee);
    }
    return 0;
  }

  private async findActiveDiscountByCoupon(code: string): Promise<IMarketingCampaign | null> {
    const now = new Date();
    return this.Campaign.findOne({
      ...buildRuntimeActiveFilter(now),
      type: 'discount',
      couponCode: code.trim().toUpperCase(),
    }).exec();
  }

  async validateCouponForUser(
    userId: string,
    couponCode: string,
    shippingAddressId: string,
    selectedItems?: string[]
  ): Promise<CouponValidationResult> {
    const campaign = await this.findActiveDiscountByCoupon(couponCode);
    if (!campaign) {
      return {
        valid: false,
        discountAmount: 0,
        subtotal: 0,
        shippingFee: 0,
        finalPrice: 0,
        message: 'Invalid or expired coupon code',
      };
    }

    const { subtotal, shippingFee } = await this.estimateCartTotals(
      userId,
      shippingAddressId,
      selectedItems
    );
    const discountAmount = this.calculateDiscountAmount(campaign, subtotal, shippingFee);
    const finalPrice = Math.max(0, subtotal + shippingFee - discountAmount);

    return {
      valid: true,
      campaign: toPublicView(campaign),
      discountAmount,
      subtotal,
      shippingFee,
      finalPrice,
    };
  }

  async resolveCouponForOrder(
    userId: string,
    couponCode: string | undefined,
    subtotal: number,
    shippingFee: number
  ): Promise<{ discountAmount: number; campaignId?: string; couponCode?: string }> {
    if (!couponCode?.trim()) {
      return { discountAmount: 0 };
    }
    const campaign = await this.findActiveDiscountByCoupon(couponCode);
    if (!campaign) {
      throw new AppError('Coupon is invalid or has expired', 400);
    }
    const discountAmount = this.calculateDiscountAmount(campaign, subtotal, shippingFee);
    return {
      discountAmount,
      campaignId: String(campaign._id),
      couponCode: campaign.couponCode,
    };
  }

  private async estimateCartTotals(
    userId: string,
    shippingAddressId: string,
    selectedItems?: string[]
  ): Promise<{ subtotal: number; shippingFee: number }> {
    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      throw new AppError('Cart is empty', 400);
    }
    let items = cart.items;
    if (selectedItems?.length) {
      items = cart.items.filter((item) => selectedItems.includes(item._id.toString()));
      if (items.length === 0) throw new AppError('No valid items selected', 400);
    }
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const address = await Address.findOne({ _id: shippingAddressId, user: userId });
    if (!address) throw new AppError('Shipping address not found', 404);
    let shippingFee = 0;
    try {
      const neighborhoodCode = address.neighborhood || address.state;
      shippingFee = await this.shippingZoneService.calculateShippingFee(neighborhoodCode || '');
    } catch {
      shippingFee = 199.99;
    }
    return { subtotal, shippingFee };
  }
}
