/**
 * Seller isolation rules — pure unit tests (no database).
 */
import assert from 'assert';
import {
  buildBuyerInitiatedMessageFilter,
  buildSellerConversationFilter,
  canAccessConversationAsSeller,
  canSellerReplyInConversation,
  canUserAccessOffer,
  computeSellerUnreadTotal,
  isSellerNotificationType,
} from '../../../utils/sellerAccess';

const sellerAUser = '507f1f77bcf86cd799439011';
const sellerADoc = '507f191e810c19729de860ea';
const sellerBUser = '507f1f77bcf86cd799439012';
const sellerBDoc = '507f191e810c19729de860eb';
const buyerUser = '507f1f77bcf86cd799439013';

describe('seller access rules', () => {
  it('seller cannot access another seller conversation', () => {
    const conversation = {
      type: 'STORE',
      seller: sellerBDoc,
      sellerUser: sellerBUser,
      participants: [sellerBUser, buyerUser],
    };

    assert.strictEqual(
      canAccessConversationAsSeller(conversation, sellerAUser, sellerADoc),
      false
    );
  });

  it('seller can reply to admin support without buyer message', () => {
    assert.strictEqual(
      canSellerReplyInConversation({ type: 'ADMIN_SELLER' }, false),
      true
    );
  });

  it('buyer initiation filter excludes system-only threads', () => {
    const filter = buildBuyerInitiatedMessageFilter('507f1f77bcf86cd799439099', buyerUser);
    assert.strictEqual(filter.sender, buyerUser);
    assert.deepStrictEqual(filter.type, { $nin: ['SYSTEM'] });
  });

  it('seller cannot reply to store thread until buyer has initiated', () => {
    assert.strictEqual(
      canSellerReplyInConversation({ type: 'STORE' }, false),
      false
    );
    assert.strictEqual(
      canSellerReplyInConversation({ type: 'STORE' }, true),
      true
    );
  });

  it('seller can access own store conversation', () => {
    const conversation = {
      type: 'STORE',
      seller: sellerADoc,
      sellerUser: sellerAUser,
      participants: [sellerAUser, buyerUser],
    };

    assert.strictEqual(
      canAccessConversationAsSeller(conversation, sellerAUser, sellerADoc),
      true
    );
  });

  it('seller cannot access another seller offer', () => {
    const offer = {
      buyer: buyerUser,
      seller: sellerBDoc,
      sellerUser: sellerBUser,
    };

    assert.strictEqual(canUserAccessOffer(offer, sellerAUser), false);
    assert.strictEqual(canUserAccessOffer(offer, sellerAUser, sellerBUser), false);
  });

  it('seller can access offer on own product', () => {
    const offer = {
      buyer: buyerUser,
      seller: sellerADoc,
      sellerUser: sellerAUser,
    };

    assert.strictEqual(canUserAccessOffer(offer, sellerAUser), true);
    assert.strictEqual(canUserAccessOffer(offer, sellerAUser, sellerAUser), true);
  });

  it('buyer can access own offer', () => {
    const offer = {
      buyer: buyerUser,
      seller: sellerADoc,
      sellerUser: sellerAUser,
    };

    assert.strictEqual(canUserAccessOffer(offer, buyerUser), true);
  });

  it('buildSellerConversationFilter scopes by seller user and seller doc', () => {
    const filter = buildSellerConversationFilter(sellerAUser, sellerADoc);
    assert.strictEqual(filter.participants, sellerAUser);
    assert.ok(Array.isArray(filter.$or));
    assert.strictEqual(filter.$or.length, 2);
  });

  it('notification count decreases after read (unread total math)', () => {
    const before = computeSellerUnreadTotal({ messages: 3, offers: 2, orders: 1, payments: 0 });
    const after = computeSellerUnreadTotal({ messages: 0, offers: 2, orders: 1, payments: 0 });
    assert.strictEqual(before, 6);
    assert.strictEqual(after, 3);
    assert.strictEqual(before - after, 3);
  });

  it('unread total remains accurate after refresh (same inputs => same count)', () => {
    const counts = { messages: 2, offers: 1, orders: 0, payments: 1 };
    assert.strictEqual(computeSellerUnreadTotal(counts), 4);
    assert.strictEqual(computeSellerUnreadTotal({ ...counts }), 4);
  });

  it('seller notification types include message and offer', () => {
    assert.strictEqual(isSellerNotificationType('message'), true);
    assert.strictEqual(isSellerNotificationType('offer'), true);
    assert.strictEqual(isSellerNotificationType('promotional'), false);
  });
});
