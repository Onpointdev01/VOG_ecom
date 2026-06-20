/**
 * One-time migration: add city and province to existing shipping zones.
 * All current zones are Lubumbashi neighborhoods in Haut-Katanga.
 * Run: npx ts-node src/utils/migrations/migrateShippingZoneCityProvince.ts
 */
import mongoose from 'mongoose';
import { ShippingZone } from '../../models/ShippingZone';
import { env } from '../../config';

(async () => {
  await mongoose.connect(env.MONGO_URL as string);

  const result = await ShippingZone.updateMany(
    { $or: [{ city: { $exists: false } }, { city: null }, { province: { $exists: false } }, { province: null }] },
    { $set: { city: 'Lubumbashi', province: 'Haut-Katanga' } }
  );

  console.log(`Migrated ${result.modifiedCount} shipping zones → city: Lubumbashi, province: Haut-Katanga`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
