# Seller/Shop Deletion Guide

## Overview
When a seller (shop) is deleted, the system handles all associated data to maintain data integrity and preserve order history.

## Deletion Methods

### 1. Soft Delete (Recommended)
- **Status**: Seller status is set to `'suspended'`
- **Products**: All products are deactivated (`isActive: false`)
- **Bids**: All pending bids are declined
- **User Account**: Remains linked to seller, role stays as `'seller'`
- **Orders**: Preserved and remain accessible
- **Reversible**: Yes, seller can be reactivated later

### 2. Hard Delete (Permanent)
- **Seller Document**: Permanently removed from database
- **Products**: Deactivated (not deleted to preserve order history)
- **Bids**: All pending bids are declined
- **User Account**: 
  - Seller reference removed
  - Role reverted to `'user'`
- **Orders**: Preserved (not deleted)
- **Reversible**: No, cannot be undone

## What Happens to Associated Data

### Products
- ✅ **Deactivated**: All products become inactive (`isActive: false`)
- ✅ **Not Deleted**: Products remain in database to preserve order history
- ✅ **Still Visible**: Products may still appear in past orders

### Orders
- ✅ **Preserved**: All orders remain in database
- ✅ **Status Unchanged**: Order status is not modified
- ✅ **History Maintained**: Complete order history is preserved
- ⚠️ **Pending Orders**: Hard delete is blocked if seller has pending/active orders

### Bids
- ✅ **Pending Bids**: All pending/open bids are automatically declined
- ✅ **Accepted Bids**: Accepted bids remain unchanged
- ✅ **History Preserved**: Bid history is maintained

### User Account
- **Soft Delete**: 
  - User account remains linked to seller
  - Role stays as `'seller'`
  - Can be reactivated later
- **Hard Delete**:
  - Seller reference removed from user
  - Role reverted to `'user'`
  - Cannot be reactivated

### Payouts
- ⚠️ **Pending Payouts**: Should be processed before deletion
- ⚠️ **Warning**: System logs warning if seller has active orders

## Usage

### Soft Delete (Recommended)
```typescript
await sellerService.deleteSeller(sellerId, false);
// or
await sellerService.deleteSeller(sellerId); // defaults to false
```

### Hard Delete
```typescript
await sellerService.deleteSeller(sellerId, true);
```

## Restrictions

### Hard Delete Restrictions
- ❌ Cannot delete if seller has pending orders (`PENDING`, `PROCESSING`, `SHIPPED`)
- ❌ Cannot delete if seller has active orders
- ✅ Can delete if all orders are `COMPLETE` or `CANCELLED`

### Soft Delete
- ✅ Always allowed (no restrictions)
- ✅ Recommended for most cases

## Best Practices

1. **Use Soft Delete First**: Always try soft delete first to allow reactivation
2. **Check Orders**: Verify order status before hard delete
3. **Process Payouts**: Ensure all pending payouts are processed
4. **Notify Seller**: Inform seller before deletion
5. **Backup Data**: Consider backing up seller data before hard delete

## Reactivation

### Soft Delete Reactivation
```typescript
// Reactivate seller
await sellerService.updateSellerProfile(sellerId, { status: 'active' });

// Reactivate products
await productService.updateMany(
  { owner: sellerId },
  { isActive: true }
);
```

### Hard Delete
- ❌ Cannot be reactivated
- ❌ Seller document is permanently removed
- ✅ User account remains but seller relationship is lost

## API Endpoint (To Be Implemented)

```typescript
// DELETE /api/v1/admin/sellers/:sellerId
// Query params: ?hardDelete=true (optional, defaults to false)
```

## Database Impact

### Collections Affected
1. **sellers**: Seller document deleted or status updated
2. **products**: Products deactivated
3. **bids**: Pending bids declined
4. **users**: Seller reference removed (hard delete only)
5. **orders**: No changes (preserved)

### Data Integrity
- ✅ Order history preserved
- ✅ Product references maintained
- ✅ User accounts remain functional
- ✅ No orphaned data

