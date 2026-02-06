/**
 * BoutiqueService – read-only boutique (Seller) listing, discovery, and performance ranking.
 * Uses existing Seller model and relations. No new DB columns. No breaking changes.
 */
import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import TYPES from '../di';
import { ISeller } from '../models/Seller';
import { IOrder } from '../models/Order';
import { IProduct } from '../models/Product';
import { BaseService } from './BaseService';

export interface BoutiqueListItem {
  id: string;
  name: string;
  logo: string;
  description: string;
  product_count: number;
  rating: number;
  created_at: string;
}

export interface BoutiquesListResult {
  boutiques: BoutiqueListItem[];
  total: number;
  totalPages: number;
  currentPage: number;
}

export interface TopBoutiquePerformance {
  id: string;
  name: string;
  logo: string;
  description: string;
  product_count: number;
  rating: number;
  created_at: string;
  performance_score: number;
  total_sales: number;
  total_orders: number;
}

export interface IBoutiqueService {
  listBoutiques(page: number, limit: number, search?: string): Promise<BoutiquesListResult>;
  getTopByPerformance(limit: number): Promise<TopBoutiquePerformance[]>;
}

@injectable()
export class BoutiqueService extends BaseService implements IBoutiqueService {
  constructor(
    @inject(TYPES.Seller) private Seller: Model<ISeller>,
    @inject(TYPES.Order) private Order: Model<IOrder>,
    @inject(TYPES.Product) private Product: Model<IProduct>
  ) {
    super();
  }

  /**
   * List boutiques (sellers) with pagination and optional search by name.
   * Product count is derived from Product collection (owner ref); Seller.products array is not maintained on create.
   * Rating uses noOfRating (Review model stores average there; rating field holds count due to existing bug).
   */
  async listBoutiques(page: number, limit: number, search?: string): Promise<BoutiquesListResult> {
    const skip = (page - 1) * limit;
    const match: Record<string, unknown> = { status: 'active' };
    if (search && search.trim()) {
      match.name = { $regex: search.trim(), $options: 'i' };
    }

    const [sellers, total, productCounts] = await Promise.all([
      this.Seller.find(match)
        .select('name logo rating noOfRating products createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.Seller.countDocuments(match),
      this.Product.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$owner', count: { $sum: 1 } } },
      ]),
    ]);

    const countByOwner = new Map<string, number>();
    for (const row of productCounts) {
      if (row._id) countByOwner.set(row._id.toString(), row.count || 0);
    }

    const boutiques: BoutiqueListItem[] = sellers.map((s: any) => {
      const sid = s._id.toString();
      const product_count = countByOwner.get(sid) ?? 0;
      const rating = typeof s.noOfRating === 'number' && s.noOfRating >= 0 && s.noOfRating <= 5
        ? s.noOfRating
        : (typeof s.rating === 'number' && s.rating >= 0 && s.rating <= 5 ? s.rating : 0);
      return {
        id: sid,
        name: s.name,
        logo: s.logo || '',
        description: '',
        product_count,
        rating,
        created_at: s.createdAt ? new Date(s.createdAt).toISOString() : '',
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;
    return {
      boutiques,
      total,
      totalPages,
      currentPage: page,
    };
  }

  /**
   * Top boutiques by performance. Score computed in-memory from existing data:
   * total sales, total orders, product count, average rating. No stored score.
   */
  async getTopByPerformance(limit: number): Promise<TopBoutiquePerformance[]> {
    const safeLimit = Math.min(Math.max(1, limit), 50);

    // Aggregate order items by product owner (seller) for sales and order counts
    const sellerMetrics = await this.Order.aggregate([
      { $match: { orderStatus: { $ne: 'CANCELLED' }, paymentStatus: 'COMPLETED' } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productDoc',
        },
      },
      { $unwind: '$productDoc' },
      {
        $group: {
          _id: '$productDoc.owner',
          totalSales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          orderIds: { $addToSet: '$_id' },
        },
      },
      {
        $project: {
          _id: 1,
          totalSales: 1,
          total_orders: { $size: '$orderIds' },
        },
      },
    ]);

    const salesBySeller = new Map<string, { totalSales: number; total_orders: number }>();
    for (const row of sellerMetrics) {
      if (row._id) {
        salesBySeller.set(row._id.toString(), {
          totalSales: row.totalSales || 0,
          total_orders: row.total_orders || 0,
        });
      }
    }

    // Product counts by owner (Seller.products array is not maintained)
    const productCountAgg = await this.Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$owner', count: { $sum: 1 } } },
    ]);
    const productCountByOwner = new Map<string, number>();
    for (const row of productCountAgg) {
      if (row._id) productCountByOwner.set(row._id.toString(), row.count || 0);
    }

    const sellers = await this.Seller.find({ status: 'active' })
      .select('name logo rating noOfRating products createdAt')
      .lean();

    const scored: TopBoutiquePerformance[] = sellers.map((s: any) => {
      const id = s._id.toString();
      const product_count = productCountByOwner.get(id) ?? 0;
      const rating = typeof s.noOfRating === 'number' && s.noOfRating >= 0 && s.noOfRating <= 5
        ? s.noOfRating
        : (typeof s.rating === 'number' && s.rating >= 0 && s.rating <= 5 ? s.rating : 0);
      const metrics = salesBySeller.get(id) || { totalSales: 0, total_orders: 0 };
      const total_sales = metrics.totalSales;
      const total_orders = metrics.total_orders;

      const salesArr = Array.from(salesBySeller.values());
      const maxSales = salesArr.length ? Math.max(...salesArr.map((m) => m.totalSales), 1) : 1;
      const maxOrders = salesArr.length ? Math.max(...salesArr.map((m) => m.total_orders), 1) : 1;
      const allProductCounts = Array.from(productCountByOwner.values());
      const maxProducts = allProductCounts.length ? Math.max(...allProductCounts, 1) : 1;
      const performance_score =
        (total_sales / maxSales) * 0.4 +
        (total_orders / maxOrders) * 0.3 +
        (product_count / maxProducts) * 0.2 +
        (rating / 5) * 0.1;

      return {
        id,
        name: s.name,
        logo: s.logo || '',
        description: '',
        product_count,
        rating,
        created_at: s.createdAt ? new Date(s.createdAt).toISOString() : '',
        performance_score: Math.round(performance_score * 100) / 100,
        total_sales,
        total_orders,
      };
    });

    scored.sort((a, b) => b.performance_score - a.performance_score);
    return scored.slice(0, safeLimit);
  }
}
