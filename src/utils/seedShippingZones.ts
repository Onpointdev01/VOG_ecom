import mongoose from 'mongoose';
import { ShippingZone } from '../models/ShippingZone';
import { env } from '../config';
import { neighborhoodCodeFromName } from './neighborhoodCode';

/** Initial Lubumbashi (HK) neighborhoods — extensible via admin UI. */
export const defaultNeighborhoods = [
  'GOLF MALELA HK',
  'GOLF METEO HK',
  'GOLF TSHAMALALE HK',
  'GOLF LA VOIX HK',
  'GOLF KABULAMESHI HK',
  'CRA HK',
  'HEWA BORA HK',
  'GOLF MAISHA HK',
  'GOLF LE BATTANT HK',
  'GOLF KARAVIA HK',
  'KASANGIRI HK',
  'JOLIE SITE HK',
  'DOUBLE POTEAU HK',
  'BEL AIRE HK',
  'RWASHI HK',
  'MAKOMENO HK',
  'KATUBA HK',
  'KASAPA HK',
  'LIDO GOLF HK',
].map((name) => ({
  name,
  code: neighborhoodCodeFromName(name),
  shippingFee: 10,
  estimatedDeliveryDays: 2,
  isActive: true,
}));

export async function seedShippingZones(force = false) {
  const existingCount = await ShippingZone.countDocuments();

  if (existingCount > 0 && !force) {
    console.log(`Found ${existingCount} shipping zones. Skipping seed (use --force to replace).`);
    return;
  }

  if (force && existingCount > 0) {
    await ShippingZone.deleteMany({});
    console.log(`Removed ${existingCount} legacy shipping zones.`);
  }

  const result = await ShippingZone.insertMany(defaultNeighborhoods);
  console.log(`Seeded ${result.length} neighborhoods.`);
  result.forEach((zone) => {
    console.log(`   - ${zone.name} (${zone.code}): $${zone.shippingFee}`);
  });
}

if (require.main === module) {
  const force = process.argv.includes('--force');
  (async () => {
    try {
      await mongoose.connect(env.MONGO_URL as string);
      await seedShippingZones(force);
      await mongoose.disconnect();
      process.exit(0);
    } catch (error) {
      console.error('Failed to seed shipping zones:', error);
      await mongoose.disconnect();
      process.exit(1);
    }
  })();
}
