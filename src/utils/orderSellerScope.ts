import { toIdString } from './mongoId';

export type OrderItemLike = {
  product?: unknown;
  price?: number;
  quantity?: number;
};

export function resolveProductId(product: unknown): string | null {
  if (product == null) return null;
  if (typeof product === 'string') {
    return /^[0-9a-fA-F]{24}$/.test(product) ? product : null;
  }
  if (typeof product === 'object') {
    const doc = product as { _id?: unknown; id?: unknown };
    try {
      if (doc._id != null) return toIdString(doc._id);
      if (doc.id != null) return toIdString(doc.id);
      return toIdString(product);
    } catch {
      return null;
    }
  }
  return null;
}

export function resolveProductOwnerId(product: unknown): string | null {
  if (product == null || typeof product !== 'object') return null;
  const owner = (product as { owner?: unknown }).owner;
  if (owner == null) return null;
  try {
    return toIdString(owner);
  } catch {
    return String(owner);
  }
}

export function itemBelongsToSeller(
  item: OrderItemLike,
  sellerId: string,
  sellerProductIds: Set<string>
): boolean {
  const productId = resolveProductId(item.product);
  if (productId && sellerProductIds.has(productId)) {
    return true;
  }
  const ownerId = resolveProductOwnerId(item.product);
  return ownerId === sellerId;
}

export function filterOrderItemsForSeller<T extends OrderItemLike>(
  items: T[],
  sellerId: string,
  sellerProductIds: Set<string>
): T[] {
  return items.filter((item) => itemBelongsToSeller(item, sellerId, sellerProductIds));
}

export function computeSellerItemsTotal(items: OrderItemLike[]): number {
  return items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  );
}

export function mapOrderItemsForResponse(
  items: Array<{
    _id?: unknown;
    product?: unknown;
    quantity?: number;
    price?: number;
    sku?: string;
    size?: string;
    color?: string;
  }>
) {
  return items.map((item) => ({
    id: item._id != null ? String(item._id) : undefined,
    product: item.product,
    quantity: item.quantity,
    price: item.price,
    sku: item.sku,
    size: item.size,
    color: item.color,
  }));
}
