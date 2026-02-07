# Payment Status Change Flow

This document explains what triggers payment status changes in the VOG e-commerce system.

## Overview

The payment status can change through **4 main mechanisms**:

1. **Automatic Update** - When order status becomes `COMPLETE` (for payment on delivery)
2. **Manual Admin Update** - Admin manually updates payment status via API
3. **Payment Service Update** - Payment service updates payment record (syncs to order)
4. **Order Service Update** - Direct update via `updatePaymentStatus` method

---

## 1. Automatic Update (Payment on Delivery)

### Trigger: Order Status → `COMPLETE`

**Location**: `VOG_ecom/src/services/OrderService.ts` - `updateOrderStatus()`

**Code**:
```typescript
// Update payment status to COMPLETED when order status becomes COMPLETE
if (orderStatus === 'COMPLETE' && previousStatus !== 'COMPLETE') {
  if (order.paymentStatus !== 'COMPLETED') {
    console.log(`💰 Updating payment status to COMPLETED for order ${orderId}`);
    order.paymentStatus = 'COMPLETED';
  }
}
```

**When it happens**:
- Admin changes order status to `COMPLETE` via `/api/v1/admin/orders/:orderId/status`
- Or when `deliverOrder()` is called (which calls `updateOrderStatus('COMPLETE')`)

**Why**: Since the only payment method is "Payment on Delivery", when an order is marked as complete, it means the payment was received.

**Flow**:
```
Admin marks order as COMPLETE
  ↓
OrderService.updateOrderStatus('COMPLETE')
  ↓
Automatically sets paymentStatus = 'COMPLETED'
  ↓
Order saved to database
```

---

## 2. Manual Admin Update via Payment API

### Endpoint: `PUT /api/v1/admin/payments/:paymentId/status`

**Location**: `VOG_ecom/src/controllers/PaymentController.ts` - `updatePaymentStatus()`

**Code**:
```typescript
@httpPut('/:paymentId/status')
async updatePaymentStatus(req: Request, res: Response) {
  const updatedPayment = await this.paymentService.updatePaymentStatus({
    paymentId,
    status,
    // ... other fields
  });
}
```

**What happens**:
1. Payment record is updated in `PaymentService.updatePaymentStatus()`
2. Payment status is synced to the order via `syncOrderPaymentStatus()`
3. If payment status is `COMPLETED`, order status is set to `CONFIRMED` (for non-COD orders)

**Location**: `VOG_ecom/src/services/PaymentService.ts` - `syncOrderPaymentStatus()`

**Code**:
```typescript
private async syncOrderPaymentStatus(orderId: string, paymentStatus: string): Promise<void> {
  await Order.findByIdAndUpdate(orderId, { 
    paymentStatus,
    ...(paymentStatus === 'COMPLETED' && { orderStatus: 'CONFIRMED' })
  });
}
```

**When it happens**:
- Admin updates payment status in the admin panel
- Frontend calls: `PUT /api/v1/admin/payments/:paymentId/status`

**Flow**:
```
Admin updates payment status in UI
  ↓
PUT /api/v1/admin/payments/:paymentId/status
  ↓
PaymentService.updatePaymentStatus()
  ↓
Payment record updated
  ↓
syncOrderPaymentStatus() syncs to order
  ↓
Order paymentStatus updated
```

---

## 3. Manual Admin Update via Order API

### Endpoint: `PUT /api/v1/admin/orders/:orderId/payment-status`

**Location**: `VOG_ecom/src/controllers/AdminController.ts` - `updateOrderPaymentStatus()`

**Code**:
```typescript
@httpPut('/orders/:orderId/payment-status', TYPES.RequireAdmin)
public async updateOrderPaymentStatus(
  @response() res: Response,
  @requestParam('orderId') orderId: string,
  @requestBody() payload: { paymentStatus: string }
) {
  const order = await this.adminService.updateOrderPaymentStatus(orderId, paymentStatus);
}
```

**What happens**:
- Directly updates the order's `paymentStatus` field
- No payment record is updated (only the order)

**Location**: `VOG_ecom/src/services/AdminService.ts` - `updateOrderPaymentStatus()`

**Code**:
```typescript
async updateOrderPaymentStatus(orderId: string, paymentStatus: string): Promise<IOrder> {
  const order = await this.verifyDoc(orderId, Order);
  order.paymentStatus = paymentStatus as any;
  await order.save();
  return order;
}
```

**When it happens**:
- Admin directly updates order payment status
- Frontend calls: `PUT /api/v1/admin/orders/:orderId/payment-status`

**Flow**:
```
Admin updates order payment status in UI
  ↓
PUT /api/v1/admin/orders/:orderId/payment-status
  ↓
AdminService.updateOrderPaymentStatus()
  ↓
Order paymentStatus updated directly
```

---

## 4. Direct Order Service Update

### Method: `OrderService.updatePaymentStatus()`

**Location**: `VOG_ecom/src/services/OrderService.ts` - `updatePaymentStatus()`

**Code**:
```typescript
async updatePaymentStatus(orderId: string, paymentStatus: string, paymentReference?: string): Promise<IOrder> {
  const order = await this.verifyDoc(orderId, Order);
  
  const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];
  if (!validStatuses.includes(paymentStatus)) {
    throw new AppError('Invalid payment status', 400);
  }

  const previousPaymentStatus = order.paymentStatus;
  order.paymentStatus = paymentStatus as any;
  
  // Auto-confirm order if payment is completed (except for cash on delivery)
  if (paymentStatus === 'COMPLETED' && order.paymentMethod !== 'CASH_ON_DELIVERY') {
    order.orderStatus = 'CONFIRMED';
  }

  await order.save();
  
  // Clear cart when payment is completed for non-COD orders
  if (paymentStatus === 'COMPLETED' && order.paymentMethod !== 'CASH_ON_DELIVERY' && previousPaymentStatus !== 'COMPLETED') {
    await this.clearCartItems(order.user.toString(), order.cartItemIds || []);
  }

  return order;
}
```

**Endpoint**: `PUT /api/v1/orders/:orderId/payment-status` (requires admin)

**When it happens**:
- Called programmatically or via API
- Auto-confirms order if payment is completed (for non-COD orders)

**Flow**:
```
API call or programmatic update
  ↓
OrderService.updatePaymentStatus()
  ↓
Order paymentStatus updated
  ↓
If COMPLETED and not COD → orderStatus = CONFIRMED
  ↓
Cart cleared (for non-COD)
```

---

## Current Implementation (Payment on Delivery Only)

Since the system **only supports Payment on Delivery**, the most common flow is:

### Normal Flow:
```
1. Order created → paymentStatus = 'PENDING'
2. Order confirmed → paymentStatus stays 'PENDING'
3. Order out for delivery → paymentStatus stays 'PENDING'
4. Order marked as COMPLETE → paymentStatus automatically = 'COMPLETED'
```

### Manual Override:
```
Admin can manually update payment status via:
- Payment API: PUT /api/v1/admin/payments/:paymentId/status
- Order API: PUT /api/v1/admin/orders/:orderId/payment-status
```

---

## Data Consistency Fixes

### 1. SellerService.getSellerOrders()
**Location**: `VOG_ecom/src/services/SellerService.ts`

**What it does**:
- When fetching seller orders, if order is `COMPLETE` but `paymentStatus` is not `COMPLETED`, it:
  1. Fixes the response (sets `paymentStatus = 'COMPLETED'`)
  2. Updates the database asynchronously

**Code**:
```typescript
if (orderStatus === 'COMPLETE') {
  if (paymentStatus !== 'COMPLETED') {
    paymentStatus = 'COMPLETED';
    // Update in database asynchronously
    this.Order.findByIdAndUpdate(orderId, { paymentStatus: 'COMPLETED' });
  }
}
```

### 2. fixCompleteOrdersPaymentStatus()
**Location**: `VOG_ecom/src/services/OrderService.ts`

**What it does**:
- Utility method to fix all existing `COMPLETE` orders that don't have `paymentStatus = 'COMPLETED'`

**Endpoint**: `POST /api/v1/admin/orders/fix-payment-status`

**Code**:
```typescript
async fixCompleteOrdersPaymentStatus(): Promise<{ updated: number }> {
  const result = await Order.updateMany(
    {
      orderStatus: 'COMPLETE',
      $or: [
        { paymentStatus: { $ne: 'COMPLETED' } },
        { paymentStatus: { $exists: false } }
      ]
    },
    {
      $set: { paymentStatus: 'COMPLETED' }
    }
  );
  return { updated: result.modifiedCount || 0 };
}
```

---

## Summary Table

| Trigger | Method | Endpoint | Auto-sync? | Notes |
|---------|--------|----------|------------|-------|
| Order → COMPLETE | `OrderService.updateOrderStatus()` | `PUT /admin/orders/:id/status` | ✅ Yes | Automatic for COD |
| Admin updates payment | `PaymentService.updatePaymentStatus()` | `PUT /admin/payments/:id/status` | ✅ Yes | Syncs to order |
| Admin updates order payment | `AdminService.updateOrderPaymentStatus()` | `PUT /admin/orders/:id/payment-status` | ❌ No | Direct update |
| Direct service call | `OrderService.updatePaymentStatus()` | `PUT /orders/:id/payment-status` | ❌ No | Can auto-confirm order |

---

## Important Notes

1. **Payment on Delivery**: Since this is the only payment method, when an order is `COMPLETE`, payment is automatically `COMPLETED`.

2. **Data Consistency**: The system includes fixes to ensure `COMPLETE` orders always have `paymentStatus = 'COMPLETED'`.

3. **Frontend Display**: The frontend also fixes the display if it receives a `COMPLETE` order with `PENDING` payment status (for immediate visual correctness).

4. **Two Payment Records**: 
   - `Payment` document (in `payments` collection) - detailed payment record
   - `Order.paymentStatus` (in `orders` collection) - simplified status on order

5. **Sync Mechanism**: When `PaymentService` updates a payment, it automatically syncs the status to the order via `syncOrderPaymentStatus()`.

---

**Last Updated**: 2025-12-12

