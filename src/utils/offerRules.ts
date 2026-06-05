import { IOfferBan, IProduct, ISeller, IUser } from '../models';
import { toIdString } from './mongoId';

const OFFER_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const ACCEPTED_OFFER_TTL_MS = 24 * 60 * 60 * 1000;

export { OFFER_COOLDOWN_MS, ACCEPTED_OFFER_TTL_MS };

export function isUserOfferBanned(user: IUser): boolean {
  const ban = user.offerBan?.isBanned ? user.offerBan : user.bidBan;
  if (!ban?.isBanned) return false;
  if (ban.expiresAt && new Date(ban.expiresAt) < new Date()) return false;
  return true;
}

export function getOfferBanMessage(user: IUser): string {
  const ban = user.offerBan?.isBanned ? user.offerBan : user.bidBan;
  return ban?.reason || 'You are not allowed to make offers at this time';
}

export function validateOfferAmount(
  product: IProduct,
  amount: number
): { valid: boolean; message?: string; min?: number; max?: number } {
  if (product.price == null || product.price <= 0) {
    return {
      valid: false,
      message: 'Cannot make an offer on products without a defined price',
    };
  }

  const min = product.price * 0.75;
  const max = product.price * 1.25;

  if (amount < min || amount > max) {
    return {
      valid: false,
      message: `Offer must be between $${min.toFixed(2)} and $${max.toFixed(2)}`,
      min,
      max,
    };
  }

  return { valid: true, min, max };
}

function buyerSellerId(buyer?: IUser | null): string {
  if (!buyer?.seller) return '';
  try {
    return toIdString(buyer.seller);
  } catch {
    return '';
  }
}

/**
 * Buyer and seller are the same party (seller account user, or buyer's linked seller store).
 */
export function isSelfStoreInteraction(
  buyerId: string,
  sellerId: string,
  sellerUserId: string,
  buyer?: IUser | null
): boolean {
  if (sellerUserId && sellerUserId === buyerId) return true;
  const linkedSellerId = buyerSellerId(buyer);
  if (linkedSellerId && linkedSellerId === sellerId) return true;
  return false;
}

export function isBuyerProductOwner(
  buyerId: string,
  product: IProduct,
  seller?: ISeller | null,
  buyer?: IUser | null
): boolean {
  const sellerId = seller ? toIdString(seller._id) : '';
  let sellerUserId = '';
  try {
    sellerUserId = seller?.user ? toIdString(seller.user) : '';
  } catch {
    sellerUserId = '';
  }

  if (isSelfStoreInteraction(buyerId, sellerId, sellerUserId, buyer)) {
    return true;
  }

  let ownerId = '';
  try {
    ownerId = product.owner ? toIdString(product.owner as unknown) : '';
  } catch {
    ownerId = '';
  }

  const linkedSellerId = buyerSellerId(buyer);
  if (linkedSellerId && ownerId && linkedSellerId === ownerId) {
    return true;
  }

  return false;
}

export const OWN_STORE_ERROR =
  'You cannot message or make offers on your own products';

export function isOfferInCooldown(offer: { cooldownUntil?: Date | null }): boolean {
  return Boolean(offer.cooldownUntil && offer.cooldownUntil > new Date());
}
