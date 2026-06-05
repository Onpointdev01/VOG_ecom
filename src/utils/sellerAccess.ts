import { toIdString } from './mongoId';

export type ConversationLike = {
  type?: string;
  seller?: unknown;
  sellerUser?: unknown;
  buyer?: unknown;
  participants?: unknown[];
};

export type OfferLike = {
  buyer?: unknown;
  seller?: unknown;
  sellerUser?: unknown;
};

/** Mongo filter: conversations visible in the seller portal inbox. */
export function buildSellerConversationFilter(userId: string, sellerDocId: string) {
  return {
    participants: userId,
    $or: [
      { type: 'ADMIN_SELLER', sellerUser: userId },
      { sellerUser: userId, seller: sellerDocId },
    ],
  };
}

/** Message types that do not count as the buyer starting a store conversation. */
export const BUYER_INITIATION_EXCLUDED_MESSAGE_TYPES = ['SYSTEM'] as const;

/** Build Mongo filter: buyer started the thread (text, inquiry, offer, etc.). */
export function buildBuyerInitiatedMessageFilter(
  conversationId: unknown,
  buyerId: string
): Record<string, unknown> {
  return {
    conversation: conversationId,
    sender: buyerId,
    type: { $nin: [...BUYER_INITIATION_EXCLUDED_MESSAGE_TYPES] },
  };
}

/**
 * Seller may chat in store threads after the buyer started (message or offer in chat).
 * Admin support threads are always open for the seller.
 */
export function canSellerReplyInConversation(
  conversation: ConversationLike,
  buyerHasInitiated: boolean
): boolean {
  if (conversation.type === 'ADMIN_SELLER') {
    return true;
  }
  return buyerHasInitiated;
}

export function canAccessConversationAsSeller(
  conversation: ConversationLike,
  userId: string,
  sellerDocId: string
): boolean {
  const sellerUserId = conversation.sellerUser ? toIdString(conversation.sellerUser) : '';
  if (sellerUserId !== userId) {
    return false;
  }

  if (conversation.type === 'ADMIN_SELLER') {
    return true;
  }

  const convSellerId = conversation.seller ? toIdString(conversation.seller) : '';
  return convSellerId === sellerDocId;
}

/** Offer readable only by buyer or owning seller users. */
export function canUserAccessOffer(
  offer: OfferLike,
  actorUserId: string,
  sellerDocUserId = ''
): boolean {
  const buyerId = offer.buyer ? toIdString(offer.buyer) : '';
  const sellerUserId = offer.sellerUser ? toIdString(offer.sellerUser) : '';

  if (actorUserId === buyerId || actorUserId === sellerUserId) {
    return true;
  }

  if (sellerDocUserId && actorUserId === sellerDocUserId) {
    return true;
  }

  return false;
}

export const SELLER_NOTIFICATION_TYPES = ['message', 'offer', 'bid', 'order', 'payment'] as const;

export type SellerNotificationType = (typeof SELLER_NOTIFICATION_TYPES)[number];

export function isSellerNotificationType(type?: string): type is SellerNotificationType {
  if (!type) return false;
  return (SELLER_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/** Unread badge count from a typed breakdown (used in tests + API). */
export function computeSellerUnreadTotal(counts: {
  messages: number;
  offers: number;
  orders: number;
  payments: number;
}): number {
  return counts.messages + counts.offers + counts.orders + counts.payments;
}
