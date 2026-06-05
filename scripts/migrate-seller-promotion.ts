import mongoose from 'mongoose';
import { env } from '../src/config';
import { migrateSellerPromotionFields } from '../src/utils/migrateSellerPromotionFields';

async function main() {
  await mongoose.connect(env.MONGO_URL as string);
  const result = await migrateSellerPromotionFields();
  console.log('Seller promotion migration complete:', result);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
