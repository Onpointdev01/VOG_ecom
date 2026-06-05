/**
 * Central product availability rules — single source of truth for listings, cart, offers, and orders.
 */
import AppError from './errors/AppError';
import { ISeller } from '../models/Seller';

export type ProductAvailabilityStatus =
  | 'ACTIVE'
  | 'OUT_OF_STOCK'
  | 'HIDDEN'
  | 'ARCHIVED'
  | 'DELETED'
  | 'INVALID';

export type ProductLike = {
  _id?: unknown;
  id?: string;
  productType?: 'simple' | 'variable';
  isActive?: boolean;
  availabilityStatus?: ProductAvailabilityStatus;
  deletedAt?: Date | string | null;
  quantityAvailable?: number;
  totalStock?: number;
  price?: number;
  variants?: Array<{ quantityAvailable?: number; isActive?: boolean }>;
  owner?: unknown;
};

export type SellerLike = Partial<ISeller> & {
  _id?: unknown;
  status?: string;
  user?: unknown;
};

export interface ProductAvailabilityContext {
  product: ProductLike;
  seller?: SellerLike | null;
}

/** Legacy DB rows use `variant`; schema enum is `variable`. */
export function isVariableProductType(productType?: string): boolean {
  return productType === 'variable' || productType === 'variant';
}

function sumVariantStock(variantList: ProductLike['variants'] = []): number {
  if (!Array.isArray(variantList)) return 0;
  return variantList
    .filter((v) => v && v.isActive !== false)
    .reduce((sum, v) => sum + Math.max(0, Number(v?.quantityAvailable) || 0), 0);
}

export function getTotalStock(
  product: ProductLike,
  variants?: ProductLike['variants']
): number {
  const variantList = variants ?? product.variants ?? [];

  if (isVariableProductType(product.productType)) {
    const fromVariants = sumVariantStock(variantList);
    if (fromVariants > 0) return fromVariants;
    if (typeof product.totalStock === 'number' && product.totalStock > 0) {
      return product.totalStock;
    }
    return 0;
  }

  return Math.max(
    0,
    Number(
      product.quantityAvailable ?? product.totalStock ?? 0
    ) || 0
  );
}

export function isSellerValid(seller?: SellerLike | null): boolean {
  if (!seller) return false;
  const status = (seller.status ?? 'active').toString().toLowerCase();
  return status === 'active' || status === '';
}

export function hasValidOwner(product: ProductLike, seller?: SellerLike | null): boolean {
  if (!product.owner) return false;
  if (!seller) return false;
  return isSellerValid(seller);
}

/** Compute status from stock, flags, seller integrity, and soft-delete. */
export function deriveAvailabilityStatus(ctx: ProductAvailabilityContext): ProductAvailabilityStatus {
  const { product, seller } = ctx;

  if (product.deletedAt) {
    return 'DELETED';
  }

  if (product.availabilityStatus === 'ARCHIVED') {
    return 'ARCHIVED';
  }

  if (product.availabilityStatus === 'DELETED') {
    return 'DELETED';
  }

  if (product.availabilityStatus === 'INVALID') {
    return 'INVALID';
  }

  if (!hasValidOwner(product, seller)) {
    return 'INVALID';
  }

  if (product.isActive === false) {
    return 'HIDDEN';
  }

  const stock = getTotalStock(product);
  if (stock <= 0) {
    return 'OUT_OF_STOCK';
  }

  return 'ACTIVE';
}

/** Shown on homepage, search, category, related products, public APIs. */
export function canDisplay(ctx: ProductAvailabilityContext): boolean {
  return deriveAvailabilityStatus(ctx) === 'ACTIVE';
}

/** Product detail page allowed (e.g. show OOS badge, disabled actions). */
export function canViewProductPage(ctx: ProductAvailabilityContext): boolean {
  const status = deriveAvailabilityStatus(ctx);
  return status === 'ACTIVE' || status === 'OUT_OF_STOCK';
}

export function canBuy(ctx: ProductAvailabilityContext): boolean {
  return deriveAvailabilityStatus(ctx) === 'ACTIVE';
}

export function canOffer(ctx: ProductAvailabilityContext): boolean {
  return deriveAvailabilityStatus(ctx) === 'ACTIVE';
}

export function assertPurchasable(
  ctx: ProductAvailabilityContext,
  quantity = 1
): void {
  const status = deriveAvailabilityStatus(ctx);

  if (status === 'DELETED' || status === 'ARCHIVED' || status === 'INVALID') {
    throw new AppError('Product is no longer available', 404);
  }

  if (status === 'HIDDEN') {
    throw new AppError('Product is not available for purchase', 409);
  }

  if (status === 'OUT_OF_STOCK') {
    throw new AppError('Product is out of stock', 409);
  }

  const stock = getTotalStock(ctx.product);
  if (quantity > stock) {
    throw new AppError('Requested quantity exceeds available stock', 400);
  }
}

export function assertOfferable(ctx: ProductAvailabilityContext): void {
  const status = deriveAvailabilityStatus(ctx);

  if (status === 'DELETED' || status === 'ARCHIVED' || status === 'INVALID') {
    throw new AppError('Product is no longer available', 404);
  }

  if (status === 'HIDDEN') {
    throw new AppError('Product is not available for offers', 409);
  }

  if (status === 'OUT_OF_STOCK') {
    throw new AppError('Product is out of stock — offers are not accepted', 409);
  }
}

/** Mongo match for public catalog aggregations (listings, search, related). */
export function publicListingMatch(extra: Record<string, unknown> = {}) {
  return {
    $and: [
      { isActive: true },
      {
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      },
      {
        $or: [
          { availabilityStatus: 'ACTIVE' },
          { availabilityStatus: { $exists: false } },
        ],
      },
      ...(Object.keys(extra).length ? [extra] : []),
    ],
  };
}

/** Attach computed fields for API responses. */
export function enrichProductAvailability<T extends Record<string, unknown>>(
  product: T,
  seller?: SellerLike | null
): T & {
  availabilityStatus: ProductAvailabilityStatus;
  totalStock: number;
  canBuy: boolean;
  canOffer: boolean;
  canDisplay: boolean;
} {
  const ctx: ProductAvailabilityContext = { product, seller };
  const availabilityStatus = deriveAvailabilityStatus(ctx);
  const totalStock = getTotalStock(product);

  return {
    ...product,
    availabilityStatus,
    totalStock,
    canBuy: canBuy(ctx),
    canOffer: canOffer(ctx),
    canDisplay: canDisplay(ctx),
  };
}
