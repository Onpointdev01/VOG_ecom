/**
 * Shared aggregation stages for public product listings.
 * Ensures only ACTIVE products from active sellers appear in storefront APIs.
 */
import { publicListingMatch } from './productAvailability';

/** Join seller and drop products without an active boutique. */
export const sellerLookupStages = [
  {
    $lookup: {
      from: 'sellers',
      localField: 'owner',
      foreignField: '_id',
      as: 'sellerDoc',
    },
  },
  {
    $unwind: {
      path: '$sellerDoc',
      preserveNullAndEmptyArrays: false,
    },
  },
  {
    $match: {
      $or: [{ 'sellerDoc.status': 'active' }, { 'sellerDoc.status': '' }],
    },
  },
  {
    $addFields: {
      owner: {
        _id: '$sellerDoc._id',
        name: '$sellerDoc.name',
        rating: '$sellerDoc.rating',
        logo: '$sellerDoc.logo',
        official: '$sellerDoc.official',
        status: '$sellerDoc.status',
      },
    },
  },
];

/** Active variants only (for variable products). */
export const variantsLookupStage = {
  $lookup: {
    from: 'productvariants',
    let: { productId: '$_id' },
    pipeline: [
      {
        $match: {
          $expr: { $eq: ['$product', '$$productId'] },
          isActive: { $ne: false },
        },
      },
      {
        $project: {
          _id: 1,
          sku: 1,
          size: 1,
          color: 1,
          price: 1,
          originalPrice: 1,
          quantityAvailable: 1,
          images: 1,
          isActive: 1,
        },
      },
    ],
    as: 'variants',
  },
};

/** Sum variant stock or use simple product quantityAvailable. */
export const totalStockStage = {
  $addFields: {
    totalStock: {
      $cond: {
        if: { $in: ['$productType', ['variable', 'variant']] },
        then: {
          $sum: {
            $map: {
              input: { $ifNull: ['$variants', []] },
              as: 'v',
              in: { $ifNull: ['$$v.quantityAvailable', 0] },
            },
          },
        },
        else: { $ifNull: ['$quantityAvailable', 0] },
      },
    },
  },
};

/** Drop non-purchasable rows after totalStock is computed. */
export const inStockOnlyMatch = {
  $match: {
    ...publicListingMatch(),
    totalStock: { $gt: 0 },
  },
};

/** Base filter applied before aggregation (indexes: isActive, availabilityStatus). */
export const publicListingBaseMatch = publicListingMatch();
