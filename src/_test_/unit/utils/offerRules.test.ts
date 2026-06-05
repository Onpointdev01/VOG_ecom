import assert from 'assert';
import {
  isUserOfferBanned,
  validateOfferAmount,
  isBuyerProductOwner,
  isOfferInCooldown,
} from '../../../utils/offerRules';
import { IProduct, ISeller, IUser } from '../../../models';

function makeUser(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: 'buyer-id',
    offerBan: { isBanned: false },
    ...overrides,
  } as IUser;
}

function makeProduct(price = 100): IProduct {
  return { price, owner: 'seller-doc-id' } as unknown as IProduct;
}

function makeSeller(userId = 'seller-user-id'): ISeller {
  return {
    _id: 'seller-doc-id',
    user: userId,
  } as unknown as ISeller;
}

describe('offerRules', () => {
  describe('validateOfferAmount', () => {
    it('accepts amount within 75%-125% of list price', () => {
      const result = validateOfferAmount(makeProduct(200), 150);
      assert.strictEqual(result.valid, true);
    });

    it('rejects amount below range', () => {
      const result = validateOfferAmount(makeProduct(200), 100);
      assert.strictEqual(result.valid, false);
    });

    it('rejects products without price', () => {
      const result = validateOfferAmount(makeProduct(0), 50);
      assert.strictEqual(result.valid, false);
    });
  });

  describe('isUserOfferBanned', () => {
    it('returns true when offerBan is active', () => {
      const user = makeUser({
        offerBan: { isBanned: true, reason: 'abuse' },
      });
      assert.strictEqual(isUserOfferBanned(user), true);
    });

    it('returns false when ban expired', () => {
      const user = makeUser({
        offerBan: {
          isBanned: true,
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      assert.strictEqual(isUserOfferBanned(user), false);
    });
  });

  describe('isBuyerProductOwner', () => {
    it('detects buyer who owns the seller account', () => {
      const seller = makeSeller('buyer-id');
      assert.strictEqual(isBuyerProductOwner('buyer-id', makeProduct(), seller), true);
    });

    it('allows buyer who is not the seller user', () => {
      const seller = makeSeller('seller-user-id');
      assert.strictEqual(isBuyerProductOwner('buyer-id', makeProduct(), seller), false);
    });

    it('detects buyer linked to the store via user.seller', () => {
      const seller = makeSeller('other-platform-user');
      const buyer = { _id: 'buyer-id', seller: 'seller-doc-id' } as unknown as IUser;
      assert.strictEqual(isBuyerProductOwner('buyer-id', makeProduct(), seller, buyer), true);
    });
  });

  describe('isOfferInCooldown', () => {
    it('returns true while cooldown is active', () => {
      assert.strictEqual(
        isOfferInCooldown({ cooldownUntil: new Date(Date.now() + 60_000) }),
        true
      );
    });

    it('returns false after cooldown ends', () => {
      assert.strictEqual(
        isOfferInCooldown({ cooldownUntil: new Date(Date.now() - 60_000) }),
        false
      );
    });
  });
});
