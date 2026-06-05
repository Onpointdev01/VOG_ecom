import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { Offer } from '../models/Offer';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { ISeller } from '../models/Seller';
import { User } from '../models/User';
import AppError from '../utils/errors/AppError';
import { boutiqueFeedSortStages, isPromotionCurrentlyActive } from '../utils/sellerPromotion';
import { excludeCancelledOrdersClause } from '../utils/orderListFilters';
import { BaseService } from './BaseService';

export interface BoutiqueSummary {
  id: string;
  name: string;
  logo: string;
  rating: number;
  noOfRating: number;
  official: boolean;
  isPinned: boolean;
  isPlatformStore: boolean;
  isPromoted: boolean;
  isPromotionActive: boolean;
  promotionTier: number;
}

export interface ListBoutiquesResult {
  boutiques: BoutiqueSummary[];
  total: number;
  totalPages: number;
  currentPage: number;
}

export interface SellerProfileDTO {
  id: string;
  name: string;
  type: 'individual' | 'company';
  logo: string;
  official: boolean;
  status: string;
  rating: number;
  noOfRating: number;
}

export interface UpdateSellerProfileInput {
  name?: string;
  type?: 'individual' | 'company';
  logo?: string;
  official?: boolean;
}

export interface SellerStatsDTO {
  products: { total: number; active: number };
  orders: { total: number; pending: number; completed: number };
  bids: { total: number; pending: number; accepted: number };
  earnings: { total: number };
}

export interface ISellerService {
  getSellerById(id: string): Promise<ISeller>;
  getProfileForUser(userId: string): Promise<SellerProfileDTO>;
  updateProfileForUser(userId: string, data: UpdateSellerProfileInput): Promise<SellerProfileDTO>;
  getSellerStats(sellerId: string): Promise<SellerStatsDTO>;
  listBoutiques(options: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<ListBoutiquesResult>;
  getTopPerformingBoutiques(limit: number): Promise<BoutiqueSummary[]>;
}

@injectable()
export class SellerService extends BaseService implements ISellerService {
  constructor(
    @inject(TYPES.Seller) private Seller: Model<ISeller>
  ) {
    super();
  }

  private async deactivateExpiredPromotions(): Promise<void> {
    await this.Seller.updateMany(
      {
        promotionActive: true,
        promotionExpiresAt: { $lte: new Date() },
      },
      { $set: { promotionActive: false } }
    );
  }

  private formatBoutique(seller: Record<string, unknown>): BoutiqueSummary {
    const id = String(seller._id ?? seller.id ?? '');
    const promotionFields = seller as {
      promotionActive?: boolean;
      promotionStartsAt?: Date;
      promotionExpiresAt?: Date;
    };
    const isPromotionActive = isPromotionCurrentlyActive(promotionFields);
    return {
      id,
      name: String(seller.name ?? ''),
      logo: String(seller.logo ?? ''),
      rating: Number(seller.rating ?? 0),
      noOfRating: Number(seller.noOfRating ?? 0),
      official: Boolean(seller.official),
      isPinned: Boolean(seller.isPinned),
      isPlatformStore: Boolean(seller.isPlatformStore),
      isPromoted: Boolean(seller.promotionActive),
      isPromotionActive,
      promotionTier: Number(seller.promotionTier ?? 1),
    };
  }

  private activeSellerFilter(search?: string) {
    const filter: Record<string, unknown> = {
      status: { $in: ['active', ''] },
    };
    if (search?.trim()) {
      filter.name = new RegExp(search.trim(), 'i');
    }
    return filter;
  }

  async listBoutiques(options: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<ListBoutiquesResult> {
    await this.deactivateExpiredPromotions();

    const page = Math.max(1, options.page);
    const limit = Math.min(100, Math.max(1, options.limit));
    const skip = (page - 1) * limit;
    const filter = this.activeSellerFilter(options.search);

    const [total, sellers] = await Promise.all([
      this.Seller.countDocuments(filter),
      this.Seller.aggregate([
        { $match: filter },
        ...boutiqueFeedSortStages(new Date(), { name: 1 }),
        { $skip: skip },
        { $limit: limit },
      ]),
    ]);

    return {
      boutiques: sellers.map((s) => this.formatBoutique(s as Record<string, unknown>)),
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      currentPage: page,
    };
  }

  async getTopPerformingBoutiques(limit: number): Promise<BoutiqueSummary[]> {
    await this.deactivateExpiredPromotions();

    const capped = Math.min(50, Math.max(1, limit));
    const sellers = await this.Seller.aggregate([
      { $match: this.activeSellerFilter() },
      ...boutiqueFeedSortStages(),
      { $limit: capped },
    ]);

    return sellers.map((s) => this.formatBoutique(s as Record<string, unknown>));
  }

  private formatSellerProfile(seller: ISeller | Record<string, unknown>): SellerProfileDTO {
    const raw = seller as Record<string, unknown>;
    const id = String(raw.id ?? raw._id ?? '');
    const typeRaw = String(raw.type ?? 'individual');
    return {
      id,
      name: String(raw.name ?? ''),
      type: typeRaw === 'company' ? 'company' : 'individual',
      logo: String(raw.logo ?? ''),
      official: Boolean(raw.official),
      status: String(raw.status ?? 'active'),
      rating: Number(raw.rating ?? 0),
      noOfRating: Number(raw.noOfRating ?? 0),
    };
  }

  private normalizeSellerType(type?: string): 'individual' | 'company' {
    const value = String(type || '').toLowerCase();
    if (value === 'company' || value === 'enterprise') {
      return 'company';
    }
    return 'individual';
  }

  async getProfileForUser(userId: string): Promise<SellerProfileDTO> {
    const user = await User.findById(userId).lean();
    if (!user) {
      throw new AppError('User not found', 404);
    }

    let seller = null;
    if (user.seller) {
      seller = await this.Seller.findById(user.seller);
    }
    if (!seller) {
      seller = await this.Seller.findOne({ user: userId });
    }
    if (!seller) {
      throw new AppError('Seller profile not found', 404);
    }

    return this.formatSellerProfile(seller.toJSON() as Record<string, unknown>);
  }

  async updateProfileForUser(
    userId: string,
    data: UpdateSellerProfileInput
  ): Promise<SellerProfileDTO> {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    let seller = user.seller
      ? await this.Seller.findById(user.seller)
      : await this.Seller.findOne({ user: userId });

    if (!seller) {
      throw new AppError('Seller profile not found', 404);
    }

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) {
        throw new AppError('Shop name is required', 400);
      }
      seller.name = name;
    }
    if (data.type !== undefined) {
      seller.type = this.normalizeSellerType(data.type);
    }
    if (data.logo !== undefined) {
      seller.logo = data.logo;
    }
    // official / promotion fields are admin-only

    await seller.save();

    if (!user.seller) {
      await User.findByIdAndUpdate(userId, { seller: seller._id, role: 'seller' });
    } else if (user.role !== 'seller' && user.role !== 'admin') {
      await User.findByIdAndUpdate(userId, { role: 'seller' });
    }

    return this.formatSellerProfile(seller.toJSON() as Record<string, unknown>);
  }

  async getSellerStats(sellerId: string): Promise<SellerStatsDTO> {
    const [productsTotal, productsActive] = await Promise.all([
      Product.countDocuments({ owner: sellerId }),
      Product.countDocuments({ owner: sellerId, isActive: true }),
    ]);

    const sellerProductIds = await Product.find({ owner: sellerId }).distinct('_id');

    let ordersTotal = 0;
    let ordersPending = 0;
    let ordersCompleted = 0;
    let earningsTotal = 0;

    if (sellerProductIds.length > 0) {
      const orderFilter = {
        'items.product': { $in: sellerProductIds },
        ...excludeCancelledOrdersClause,
      };

      [ordersTotal, ordersPending, ordersCompleted] = await Promise.all([
        Order.countDocuments(orderFilter),
        Order.countDocuments({ ...orderFilter, orderStatus: 'PENDING' }),
        Order.countDocuments({ ...orderFilter, orderStatus: 'COMPLETE' }),
      ]);

      const completedOrders = await Order.find({
        ...orderFilter,
        orderStatus: 'COMPLETE',
        paymentStatus: 'COMPLETED',
      })
        .select('items')
        .lean();

      const productIdSet = new Set(sellerProductIds.map((id: unknown) => String(id)));
      for (const order of completedOrders) {
        for (const item of order.items || []) {
          const productRef = item.product as { _id?: unknown } | unknown;
          const productKey =
            productRef && typeof productRef === 'object' && '_id' in (productRef as object)
              ? String((productRef as { _id: unknown })._id)
              : String(productRef);
          if (productIdSet.has(productKey)) {
            earningsTotal += (Number(item.price) || 0) * (Number(item.quantity) || 1);
          }
        }
      }
    }

    const offerFilter = { seller: sellerId };
    const [bidsTotal, bidsPending, bidsAccepted] = await Promise.all([
      Offer.countDocuments(offerFilter),
      Offer.countDocuments({ ...offerFilter, status: 'PENDING' }),
      Offer.countDocuments({ ...offerFilter, status: 'ACCEPTED' }),
    ]);

    return {
      products: { total: productsTotal, active: productsActive },
      orders: { total: ordersTotal, pending: ordersPending, completed: ordersCompleted },
      bids: { total: bidsTotal, pending: bidsPending, accepted: bidsAccepted },
      earnings: { total: Math.round(earningsTotal * 100) / 100 },
    };
  }

  async getSellerById(id: string): Promise<ISeller> {
    const seller = await this.Seller.findById(id)
      .populate('user', 'firstName lastName email phoneNumber profilePicture')
      .lean();

    if (!seller) {
      throw new AppError('Seller not found', 404);
    }

    // Transform for API response
    return {
      ...seller,
      id: (seller._id as any).toString(),
      _id: undefined,
    } as any;
  }
}
