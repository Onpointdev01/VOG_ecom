/**
 * Migration: Update Bid Status Values
 * 
 * Changes bid status enum from old values to new values:
 * - PENDING -> open
 * - ACCEPTED -> accepted_by_admin
 * - REJECTED -> declined_by_admin
 * - EXPIRED -> expired
 * - CANCELLED -> cancelled
 * 
 * Run with: ts-node migrations/001_update_bid_statuses.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const BID_STATUS_MAPPING: Record<string, string> = {
  'PENDING': 'open',
  'ACCEPTED': 'accepted_by_admin',
  'REJECTED': 'declined_by_admin',
  'EXPIRED': 'expired',
  'CANCELLED': 'cancelled',
};

async function migrateBidStatuses() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL || '');
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const bidsCollection = db.collection('bids');

    // Get all bids
    const bids = await bidsCollection.find({}).toArray();
    console.log(`📊 Found ${bids.length} bids to migrate`);

    let updated = 0;
    let skipped = 0;

    for (const bid of bids) {
      const oldStatus = bid.status;
      const newStatus = BID_STATUS_MAPPING[oldStatus];

      if (!newStatus) {
        console.log(`⚠️  Skipping bid ${bid._id}: unknown status "${oldStatus}"`);
        skipped++;
        continue;
      }

      if (oldStatus === newStatus) {
        skipped++;
        continue;
      }

      await bidsCollection.updateOne(
        { _id: bid._id },
        { $set: { status: newStatus } }
      );

      console.log(`✅ Updated bid ${bid._id}: ${oldStatus} -> ${newStatus}`);
      updated++;
    }

    console.log(`\n📈 Migration complete:`);
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Skipped: ${skipped}`);
    console.log(`   - Total: ${bids.length}`);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateBidStatuses();

