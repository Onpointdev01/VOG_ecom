/** Promotion / feed ranking helpers for seller boutiques. */

export const PLATFORM_STORE_NAME = 'System Admin Store';

export interface SellerPromotionFields {
  isPinned?: boolean;
  isPlatformStore?: boolean;
  promotionActive?: boolean;
  promotionStartsAt?: Date | string | null;
  promotionExpiresAt?: Date | string | null;
  promotionActivatedAt?: Date | string | null;
  promotionTier?: number;
}

export function isPromotionCurrentlyActive(
  seller: SellerPromotionFields,
  now: Date = new Date()
): boolean {
  if (!seller.promotionActive) {
    return false;
  }
  if (seller.promotionStartsAt) {
    const starts = new Date(seller.promotionStartsAt);
    if (!Number.isNaN(starts.getTime()) && starts > now) {
      return false;
    }
  }
  if (seller.promotionExpiresAt) {
    const expires = new Date(seller.promotionExpiresAt);
    if (!Number.isNaN(expires.getTime()) && expires <= now) {
      return false;
    }
  }
  return true;
}

import { PipelineStage } from 'mongoose';

/** MongoDB aggregation stages: pinned → live promotion (newest activation) → rest. */
export function boutiqueFeedSortStages(
  now: Date = new Date(),
  restSort: Record<string, 1 | -1> = { rating: -1, noOfRating: -1, name: 1 }
): PipelineStage[] {
  return [
    {
      $addFields: {
        __isPinned: { $cond: [{ $eq: ['$isPinned', true] }, 1, 0] },
        __promotionLive: {
          $cond: [
            {
              $and: [
                { $eq: ['$promotionActive', true] },
                {
                  $or: [
                    { $eq: ['$promotionStartsAt', null] },
                    { $not: '$promotionStartsAt' },
                    { $lte: ['$promotionStartsAt', now] },
                  ],
                },
                {
                  $or: [
                    { $eq: ['$promotionExpiresAt', null] },
                    { $not: '$promotionExpiresAt' },
                    { $gt: ['$promotionExpiresAt', now] },
                  ],
                },
              ],
            },
            1,
            0,
          ],
        },
        __promotionActivatedAt: { $ifNull: ['$promotionActivatedAt', new Date(0)] },
      },
    },
    {
      $sort: {
        __isPinned: -1,
        __promotionLive: -1,
        __promotionActivatedAt: -1,
        ...restSort,
      },
    },
  ] as PipelineStage[];
}
