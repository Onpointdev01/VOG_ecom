/**
 * One-time: normalize legacy Seller.type "company" -> "enterprise" in MongoDB.
 * Run after deploy (or before) with MONGODB_URI in env:
 *   node scripts/migrate-seller-type-company-to-enterprise.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('Set MONGODB_URI (or MONGO_URI)');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('sellers');
  const r = await col.updateMany({ type: 'company' }, { $set: { type: 'enterprise' } });
  console.log('Matched:', r.matchedCount, 'Modified:', r.modifiedCount);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
