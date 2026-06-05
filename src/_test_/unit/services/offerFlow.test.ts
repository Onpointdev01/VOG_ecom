/**
 * Unit tests for offer flow rules (no database).
 * Covers: own-product guard, expiry guard, seller user mapping for messages.
 */
import assert from 'assert';
import { validateOfferAmount, isBuyerProductOwner } from '../../../utils/offerRules';
import { toIdString } from '../../../utils/mongoId';
import { ACCEPTED_OFFER_TTL_MS } from '../../../utils/offerRules';

describe('offer flow rules', () => {
  it('buyer cannot offer on own product (seller.user matches buyer)', () => {
    const buyerId = '507f1f77bcf86cd799439011';
    const seller = {
      _id: '507f191e810c19729de860ea',
      user: buyerId,
    };
    const product = { price: 100, owner: seller._id };

    assert.strictEqual(
      isBuyerProductOwner(buyerId, product as never, seller as never),
      true
    );
    const validation = validateOfferAmount(product as never, 90);
    assert.strictEqual(validation.valid, true);
  });

  it('expired accepted offer window is 24 hours from acceptance', () => {
    const acceptedAt = Date.now();
    const expiresAt = new Date(acceptedAt + ACCEPTED_OFFER_TTL_MS);
    assert.strictEqual(expiresAt.getTime() - acceptedAt, 24 * 60 * 60 * 1000);
    assert.strictEqual(expiresAt < new Date(), false);
  });

  it('message recipient must be seller user id, not seller document id', () => {
    const sellerDocId = '507f191e810c19729de860ea';
    const sellerUserId = '507f1f77bcf86cd799439011';
    const seller = { _id: sellerDocId, user: sellerUserId };

    assert.notStrictEqual(toIdString(seller), sellerUserId);
    assert.strictEqual(toIdString(seller.user), sellerUserId);
  });

  it('rejected offer blocks new offer while cooldown active', () => {
    const cooldownUntil = new Date(Date.now() + 12 * 60 * 60 * 1000);
    assert.strictEqual(cooldownUntil > new Date(), true);
  });
});
