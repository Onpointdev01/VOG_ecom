import { Seller } from '../models/Seller';
import { PLATFORM_STORE_NAME } from './sellerPromotion';

/** One-time style migration: set platform store pinned + default promotion fields. */
export async function migrateSellerPromotionFields() {
  await Seller.updateMany(
    { isPinned: { $exists: false } },
    {
      $set: {
        isPinned: false,
        isPlatformStore: false,
        promotionActive: false,
        promotionTier: 1,
      },
    }
  );

  await Seller.updateMany(
    { name: PLATFORM_STORE_NAME },
    {
      $set: {
        isPinned: true,
        isPlatformStore: true,
        official: true,
        promotionActive: false,
      },
    }
  );

  const expired = await Seller.updateMany(
    {
      promotionActive: true,
      promotionExpiresAt: { $lte: new Date() },
    },
    { $set: { promotionActive: false } }
  );

  return { expiredDeactivated: expired.modifiedCount };
}
