/**
 * Sync product availabilityStatus and flag orphan products.
 * Default: dry-run (no writes). Pass --apply to persist changes.
 *
 *   npx ts-node scripts/sync-product-availability.ts
 *   npx ts-node scripts/sync-product-availability.ts --apply
 */
import 'reflect-metadata';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Product, Seller, ProductVariant } from '../src/models';
import { ProductCleanupService } from '../src/services/ProductCleanupService';

dotenv.config();

async function main() {
  const apply = process.argv.includes('--apply');
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error('MONGO_URL is required');
    process.exit(1);
  }

  await mongoose.connect(mongoUrl);

  const cleanup = new ProductCleanupService(
    Product as never,
    Seller as never,
    ProductVariant as never
  );

  const report = await cleanup.runCleanup({ dryRun: !apply });
  console.log(JSON.stringify(report, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
