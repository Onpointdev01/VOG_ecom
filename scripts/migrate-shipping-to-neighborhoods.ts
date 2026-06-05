/**
 * Migrates province-based shipping zones to quartier-based zones.
 * Run: npx ts-node scripts/migrate-shipping-to-neighborhoods.ts [--force]
 */
import mongoose from 'mongoose';
import { env } from '../src/config';
import { Address } from '../src/models/Address';
import { ShippingZone } from '../src/models/ShippingZone';
import { seedShippingZones } from '../src/utils/seedShippingZones';
import { neighborhoodCodeFromName } from '../src/utils/neighborhoodCode';

async function dropLegacyShippingIndexes() {
  const collection = ShippingZone.collection;
  const indexes = await collection.indexes();
  for (const index of indexes) {
    const keys = Object.keys(index.key || {});
    if (keys.includes('province') || keys.includes('provinceCode')) {
      try {
        if (index.name) {
          await collection.dropIndex(index.name);
          console.log(`Dropped legacy index: ${index.name}`);
        }
      } catch {
        // already removed
      }
    }
  }
  try {
    await ShippingZone.syncIndexes();
  } catch (err) {
    console.warn('syncIndexes skipped:', (err as Error).message);
  }
}

async function migrateAddresses() {
  const addresses = await Address.find({}).lean();
  let updated = 0;

  for (const addr of addresses) {
    const doc = addr as unknown as {
      _id: mongoose.Types.ObjectId;
      neighborhood?: string;
      state?: string;
    };

    if (doc.neighborhood?.trim()) {
      continue;
    }

    const legacy = doc.state?.trim();
    const neighborhood = legacy ? neighborhoodCodeFromName(legacy) : 'GOLF_MALELA_HK';

    await Address.updateOne({ _id: doc._id }, { $set: { neighborhood } });
    updated += 1;
  }

  console.log(`Updated ${updated} address(es) with neighborhood codes.`);
}

async function main() {
  const force = process.argv.includes('--force');
  await mongoose.connect(env.MONGO_URL as string);
  console.log('Connected to database');

  await dropLegacyShippingIndexes();
  await seedShippingZones(force);
  await migrateAddresses();

  await mongoose.disconnect();
  console.log('Migration complete.');
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
