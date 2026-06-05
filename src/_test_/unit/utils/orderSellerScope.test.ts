/**
 * Seller order item scoping — pure unit tests (no database).
 */
import assert from 'assert';
import {
  computeSellerItemsTotal,
  filterOrderItemsForSeller,
  itemBelongsToSeller,
  resolveProductId,
  resolveProductOwnerId,
} from '../../../utils/orderSellerScope';

const sellerId = '507f191e810c19729de860ea';
const otherSellerId = '507f191e810c19729de860eb';
const productA = '507f1f77bcf86cd799439021';
const productB = '507f1f77bcf86cd799439022';

describe('order seller scope', () => {
  it('resolves product id from string or populated doc', () => {
    assert.strictEqual(resolveProductId(productA), productA);
    assert.strictEqual(resolveProductId({ _id: productB }), productB);
  });

  it('resolves owner from populated product', () => {
    assert.strictEqual(
      resolveProductOwnerId({ _id: productA, owner: sellerId }),
      sellerId
    );
  });

  it('itemBelongsToSeller matches by product id set or owner', () => {
    const sellerProducts = new Set([productA]);
    assert.strictEqual(
      itemBelongsToSeller({ product: productA }, sellerId, sellerProducts),
      true
    );
    assert.strictEqual(
      itemBelongsToSeller(
        { product: { _id: productB, owner: sellerId } },
        sellerId,
        sellerProducts
      ),
      true
    );
    assert.strictEqual(
      itemBelongsToSeller(
        { product: { _id: productB, owner: otherSellerId } },
        sellerId,
        sellerProducts
      ),
      false
    );
  });

  it('filterOrderItemsForSeller keeps only seller lines', () => {
    const items = [
      { product: productA, price: 10, quantity: 2 },
      { product: { _id: productB, owner: otherSellerId }, price: 5, quantity: 1 },
      { product: { _id: '507f1f77bcf86cd799439023', owner: sellerId }, price: 20, quantity: 1 },
    ];
    const sellerProducts = new Set([productA]);
    const filtered = filterOrderItemsForSeller(items, sellerId, sellerProducts);
    assert.strictEqual(filtered.length, 2);
    assert.strictEqual(computeSellerItemsTotal(filtered), 40);
  });

  it('computeSellerItemsTotal sums price * quantity', () => {
    const total = computeSellerItemsTotal([
      { price: 12.5, quantity: 2 },
      { price: 3, quantity: 1 },
    ]);
    assert.strictEqual(total, 28);
  });
});
