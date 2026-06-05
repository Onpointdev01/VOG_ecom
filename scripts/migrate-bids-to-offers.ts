/**
 * One-time migration: legacy bids + bidmessages → conversations + offers + messages
 *
 * Usage:
 *   npx ts-node scripts/migrate-bids-to-offers.ts --dry-run
 *   npx ts-node scripts/migrate-bids-to-offers.ts
 *
 * Options:
 *   --dry-run   Log actions without writing
 *   --skip-existing   Skip bids that already have a matching offer (_id preserved)
 */
import mongoose from 'mongoose';
import connectToDB from '../src/db/connect';
import { Bid, IBid } from '../src/models/ProductBid';
import { BidMessage, IBidMessages } from '../src/models/BidMessages';
import { Conversation } from '../src/models/Conversation';
import { Offer } from '../src/models/Offer';
import { Message, MessageType } from '../src/models/Message';
import { Seller } from '../src/models/Seller';
import { Product } from '../src/models/Product';

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_EXISTING = process.argv.includes('--skip-existing');

type LegacyBidMessageType = IBidMessages['type'];

const MESSAGE_TYPE_MAP: Record<LegacyBidMessageType, MessageType> = {
  BID_PROPOSAL: 'OFFER_CREATED',
  BID_ACCEPTED: 'OFFER_ACCEPTED',
  BID_REJECTED: 'OFFER_REJECTED',
  SYSTEM: 'SYSTEM',
  PRODUCT_INQUIRY: 'PRODUCT_INQUIRY',
};

const OFFER_STATUS_MAP: Record<string, string> = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
};

function idStr(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return idStr((value as { _id: unknown })._id);
  }
  return String(value);
}

async function resolveSellerUserId(sellerId: string): Promise<string | null> {
  const seller = await Seller.findById(sellerId).select('user');
  if (!seller?.user) return null;
  return idStr(seller.user);
}

async function resolveUserId(maybeUserOrSellerId: string): Promise<string> {
  const asUser = maybeUserOrSellerId;
  const sellerUser = await resolveSellerUserId(maybeUserOrSellerId);
  return sellerUser || asUser;
}

async function upsertConversation(params: {
  productId: string;
  buyerId: string;
  sellerId: string;
  sellerUserId: string;
  lastMessage?: string;
  lastMessageAt?: Date;
}) {
  const { productId, buyerId, sellerId, sellerUserId, lastMessage, lastMessageAt } = params;
  const filter = { product: productId, buyer: buyerId, seller: sellerId };

  if (DRY_RUN) {
    const existing = await Conversation.findOne(filter);
    return existing || { _id: new mongoose.Types.ObjectId(), dryRun: true };
  }

  return Conversation.findOneAndUpdate(
    filter,
    {
      $setOnInsert: {
        product: productId,
        buyer: buyerId,
        seller: sellerId,
        sellerUser: sellerUserId,
        participants: [buyerId, sellerUserId],
        unreadByBuyer: 0,
        unreadBySeller: 0,
        hasActiveOffer: false,
      },
      ...(lastMessage
        ? { $set: { lastMessage, lastMessageAt: lastMessageAt || new Date() } }
        : {}),
    },
    { upsert: true, new: true }
  );
}

function mapOfferStatus(bid: IBid & { convertedToCart?: boolean }): string {
  if (bid.convertedToCart) return 'CONVERTED';
  return OFFER_STATUS_MAP[bid.status] || 'PENDING';
}

async function migrateBids(stats: Record<string, number>) {
  const bids = await Bid.find().sort({ createdAt: 1 }).lean();
  const bidToOfferId = new Map<string, string>();
  const conversationByKey = new Map<string, string>();

  for (const bid of bids) {
    const bidId = idStr(bid._id);
    const productId = idStr(bid.product);
    const buyerId = idStr(bid.buyer);
    const sellerId = idStr(bid.seller);

    const sellerUserId = await resolveSellerUserId(sellerId);
    if (!sellerUserId) {
      stats.skippedBidsMissingSellerUser += 1;
      console.warn(`Skip bid ${bidId}: seller user not found for seller ${sellerId}`);
      continue;
    }

    const convKey = `${productId}:${buyerId}:${sellerId}`;
    let conversationId = conversationByKey.get(convKey);

    if (!conversationId) {
      const conversation = await upsertConversation({
        productId,
        buyerId,
        sellerId,
        sellerUserId,
      });
      conversationId = idStr(conversation._id);
      conversationByKey.set(convKey, conversationId);
      stats.conversationsUpserted += 1;
    }

    if (SKIP_EXISTING) {
      const existingOffer = await Offer.findById(bidId);
      if (existingOffer) {
        bidToOfferId.set(bidId, bidId);
        stats.offersSkippedExisting += 1;
        continue;
      }
    }

    const status = mapOfferStatus(bid as IBid & { convertedToCart?: boolean });
    const offerDoc = {
      _id: new mongoose.Types.ObjectId(bidId),
      conversation: conversationId,
      product: productId,
      buyer: buyerId,
      seller: sellerId,
      sellerUser: sellerUserId,
      amount: bid.bidPrice,
      status,
      expiresAt: (bid as { expiresAt?: Date }).expiresAt || null,
      acceptedAt: status === 'ACCEPTED' || status === 'CONVERTED' ? bid.updatedAt : null,
      rejectedAt: status === 'REJECTED' ? bid.updatedAt : null,
      cooldownUntil: bid.cooldownUntil || null,
      convertedAt: bid.convertedAt || null,
      createdAt: bid.createdAt,
      updatedAt: bid.updatedAt,
    };

    if (DRY_RUN) {
      console.log(`[dry-run] offer ${bidId} -> conversation ${conversationId} status=${status}`);
    } else {
      await Offer.findOneAndUpdate({ _id: bidId }, offerDoc, { upsert: true, new: true });
    }

    bidToOfferId.set(bidId, bidId);
    stats.offersMigrated += 1;

    const isActive = status === 'PENDING' || status === 'ACCEPTED';
    if (isActive && !DRY_RUN) {
      await Conversation.updateOne(
        { _id: conversationId },
        { hasActiveOffer: true, activeOffer: bidId }
      );
    }
  }

  return { bidToOfferId, conversationByKey };
}

async function migrateMessages(
  bidToOfferId: Map<string, string>,
  conversationByKey: Map<string, string>,
  stats: Record<string, number>
) {
  const legacyMessages = await BidMessage.find().sort({ createdAt: 1 }).lean();

  for (const msg of legacyMessages) {
    const productId = idStr(msg.product);
    const senderRaw = idStr(msg.sender);
    const recipientRaw = idStr(msg.recipient);

    const senderId = await resolveUserId(senderRaw);
    const recipientId = await resolveUserId(recipientRaw);

    let conversationId: string | undefined;

    if (msg.bid) {
      const offerId = bidToOfferId.get(idStr(msg.bid));
      if (offerId) {
        const offer = await Offer.findById(offerId).select('conversation');
        if (offer) conversationId = idStr(offer.conversation);
      }
    }

    if (!conversationId) {
      for (const [key, convId] of conversationByKey.entries()) {
        if (key.startsWith(`${productId}:`)) {
          conversationId = convId;
          break;
        }
      }
    }

    if (!conversationId) {
      const product = await Product.findById(productId).select('owner');
      if (!product?.owner) {
        stats.skippedMessagesNoConversation += 1;
        continue;
      }
      const sellerId = idStr(product.owner);
      const sellerUserId = await resolveSellerUserId(sellerId);
      if (!sellerUserId) {
        stats.skippedMessagesNoConversation += 1;
        continue;
      }
      const buyerId = senderId === sellerUserId ? recipientId : senderId;
      const conv = await upsertConversation({
        productId,
        buyerId,
        sellerId,
        sellerUserId,
        lastMessage: msg.message,
        lastMessageAt: msg.createdAt,
      });
      conversationId = idStr(conv._id);
      conversationByKey.set(`${productId}:${buyerId}:${sellerId}`, conversationId);
    }

    const mappedType = MESSAGE_TYPE_MAP[msg.type] || 'TEXT';
    const offerRef = msg.bid ? bidToOfferId.get(idStr(msg.bid)) : undefined;

    const messageDoc = {
      conversation: conversationId,
      sender: senderId,
      recipient: recipientId,
      product: productId,
      ...(offerRef ? { offer: offerRef } : {}),
      type: mappedType,
      text: msg.message,
      createdAt: msg.createdAt,
      updatedAt: (msg as { updatedAt?: Date }).updatedAt || msg.createdAt,
    };

    if (DRY_RUN) {
      console.log(`[dry-run] message ${idStr(msg._id)} -> conversation ${conversationId} type=${mappedType}`);
    } else {
      await Message.findOneAndUpdate({ _id: msg._id }, messageDoc, { upsert: true, new: true });
    }

    stats.messagesMigrated += 1;

    if (!DRY_RUN && msg.message) {
      await Conversation.updateOne(
        { _id: conversationId },
        { lastMessage: msg.message, lastMessageAt: msg.createdAt }
      );
    }
  }
}

async function main() {
  const stats = {
    conversationsUpserted: 0,
    offersMigrated: 0,
    offersSkippedExisting: 0,
    skippedBidsMissingSellerUser: 0,
    messagesMigrated: 0,
    skippedMessagesNoConversation: 0,
  };

  console.log(`Migration starting${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  await connectToDB();

  const { bidToOfferId, conversationByKey } = await migrateBids(stats);
  await migrateMessages(bidToOfferId, conversationByKey, stats);

  console.log('Migration complete:', stats);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
