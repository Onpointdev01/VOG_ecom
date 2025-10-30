// Seed script to populate Congo DRC provinces with default shipping costs
import mongoose from 'mongoose';
import { ShippingZone } from '../models/ShippingZone';
import { env } from '../config';

export const congoProvinces = [
  { province: 'Kinshasa', provinceCode: 'KN', shippingFee: 150.00, estimatedDeliveryDays: 2 },
  { province: 'Kongo Central (Bas-Congo)', provinceCode: 'BC', shippingFee: 200.00, estimatedDeliveryDays: 3 },
  { province: 'Kwango', provinceCode: 'KG', shippingFee: 250.00, estimatedDeliveryDays: 4 },
  { province: 'Kwilu', provinceCode: 'KL', shippingFee: 250.00, estimatedDeliveryDays: 4 },
  { province: 'Mai-Ndombe', provinceCode: 'MN', shippingFee: 280.00, estimatedDeliveryDays: 5 },
  { province: 'Kasai', provinceCode: 'KS', shippingFee: 300.00, estimatedDeliveryDays: 5 },
  { province: 'Kasai-Central', provinceCode: 'KC', shippingFee: 300.00, estimatedDeliveryDays: 5 },
  { province: 'Kasai-Oriental', provinceCode: 'KE', shippingFee: 320.00, estimatedDeliveryDays: 6 },
  { province: 'Lomami', provinceCode: 'LO', shippingFee: 320.00, estimatedDeliveryDays: 6 },
  { province: 'Sankuru', provinceCode: 'SA', shippingFee: 350.00, estimatedDeliveryDays: 7 },
  { province: 'Maniema', provinceCode: 'MA', shippingFee: 380.00, estimatedDeliveryDays: 7 },
  { province: 'South Kivu (Sud-Kivu)', provinceCode: 'SK', shippingFee: 400.00, estimatedDeliveryDays: 8 },
  { province: 'North Kivu (Nord-Kivu)', provinceCode: 'NK', shippingFee: 400.00, estimatedDeliveryDays: 8 },
  { province: 'Ituri', provinceCode: 'IT', shippingFee: 420.00, estimatedDeliveryDays: 9 },
  { province: 'Haut-Uele', provinceCode: 'HU', shippingFee: 450.00, estimatedDeliveryDays: 10 },
  { province: 'Tshopo', provinceCode: 'TO', shippingFee: 380.00, estimatedDeliveryDays: 8 },
  { province: 'Bas-Uele', provinceCode: 'BU', shippingFee: 450.00, estimatedDeliveryDays: 10 },
  { province: 'Nord-Ubangi', provinceCode: 'NU', shippingFee: 400.00, estimatedDeliveryDays: 9 },
  { province: 'Mongala', provinceCode: 'MO', shippingFee: 380.00, estimatedDeliveryDays: 8 },
  { province: 'Sud-Ubangi', provinceCode: 'SU', shippingFee: 350.00, estimatedDeliveryDays: 7 },
  { province: 'Équateur', provinceCode: 'EQ', shippingFee: 320.00, estimatedDeliveryDays: 6 },
  { province: 'Tshuapa', provinceCode: 'TU', shippingFee: 350.00, estimatedDeliveryDays: 7 },
  { province: 'Tanganyika', provinceCode: 'TA', shippingFee: 420.00, estimatedDeliveryDays: 9 },
  { province: 'Haut-Lomami', provinceCode: 'HL', shippingFee: 380.00, estimatedDeliveryDays: 8 },
  { province: 'Lualaba', provinceCode: 'LU', shippingFee: 400.00, estimatedDeliveryDays: 9 },
  { province: 'Haut-Katanga', provinceCode: 'HK', shippingFee: 420.00, estimatedDeliveryDays: 9 },
];

export async function seedShippingZones() {
  try {
    console.log('🌱 Seeding shipping zones for Congo DRC provinces...');

    // Check if shipping zones already exist
    const existingCount = await ShippingZone.countDocuments();

    if (existingCount > 0) {
      console.log(`ℹ️  Found ${existingCount} existing shipping zones. Skipping seed.`);
      console.log('💡 To reseed, delete existing zones first or run a force update.');
      return;
    }

    // Insert all provinces
    const result = await ShippingZone.insertMany(congoProvinces);

    console.log(`✅ Successfully seeded ${result.length} shipping zones!`);
    console.log('📋 Provinces added:');
    result.forEach((zone) => {
      console.log(`   - ${zone.province} (${zone.provinceCode}): $${zone.shippingFee}`);
    });
  } catch (error) {
    console.error('❌ Error seeding shipping zones:', error);
    throw error;
  }
}

// Allow running this script directly
if (require.main === module) {
  (async () => {
    try {
      // Connect to database
      await mongoose.connect(env.MONGO_URL as string);
      console.log('📦 Connected to database');

      // Run seed
      await seedShippingZones();

      // Disconnect
      await mongoose.disconnect();
      console.log('👋 Disconnected from database');

      process.exit(0);
    } catch (error) {
      console.error('❌ Failed to seed shipping zones:', error);
      await mongoose.disconnect();
      process.exit(1);
    }
  })();
}
