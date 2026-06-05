/**
 * Marketplace conversation migration
 *
 * 1. Backfill Conversation.type = 'PRODUCT' where missing
 * 2. Create ConversationProduct rows from existing product-linked conversations
 * 3. Drop legacy unique index (product,buyer,seller) if present; partial indexes apply from model
 *
 * Usage:
 *   npx ts-node scripts/migrate-conversations-to-marketplace.ts
 *   npx ts-node scripts/migrate-conversations-to-marketplace.ts --apply
 */
import mongoose from 'mongoose';
import { env } from '../src/config';
import { Conversation } from '../src/models/Conversation';
import { ConversationProduct } from '../src/models/ConversationProduct';

const apply = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(env.MONGO_URL);
  console.log('Connected to MongoDB');

  const withoutType = await Conversation.countDocuments({
    $or: [{ type: { $exists: false } }, { type: null }],
  });
  console.log(`Conversations missing type: ${withoutType}`);

  const legacyConversations = await Conversation.find({
    product: { $ne: null },
  }).lean();

  console.log(`Product-linked conversations: ${legacyConversations.length}`);

  const cpCollection = ConversationProduct.collection;
  const allCp = await cpCollection.find({}).toArray();
  let invalidCp = 0;
  for (const row of allCp) {
    const conv = row.conversation;
    const valid =
      conv instanceof mongoose.Types.ObjectId ||
      (typeof conv === 'string' && /^[0-9a-fA-F]{24}$/.test(conv));
    if (!valid) {
      invalidCp += 1;
      if (apply) {
        await cpCollection.deleteOne({ _id: row._id });
      }
    }
  }
  console.log(`ConversationProduct rows with invalid conversation ref: ${invalidCp}`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write changes.');
    await mongoose.disconnect();
    return;
  }

  await Conversation.updateMany(
    { $or: [{ type: { $exists: false } }, { type: null }] },
    { $set: { type: 'PRODUCT', status: 'OPEN' } }
  );

  let attached = 0;
  for (const conv of legacyConversations) {
    const conversationId = conv._id;
    const productId = conv.product;
    if (!productId) continue;

    await ConversationProduct.findOneAndUpdate(
      { conversation: conversationId, product: productId },
      { $setOnInsert: { attachedAt: conv.createdAt || new Date() } },
      { upsert: true }
    );
    attached += 1;
  }

  console.log(`ConversationProduct rows upserted: ${attached}`);

  try {
    await Conversation.collection.dropIndex('product_1_buyer_1_seller_1');
    console.log('Dropped legacy index product_1_buyer_1_seller_1');
  } catch (e) {
    console.warn('Legacy index drop skipped:', (e as Error).message);
  }

  await Conversation.syncIndexes();
  console.log('Conversation indexes synced');

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
