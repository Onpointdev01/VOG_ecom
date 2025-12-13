# Seller API Endpoints Documentation

## Overview
This document describes all API endpoints available for sellers to manage their shop, products, orders, and bids.

## Authentication
All endpoints require authentication with `Bearer Token` and seller role.
- Header: `Authorization: Bearer <token>`
- Middleware: `RequireSignIn` + `RequireSeller`

## Base URL
```
/api/v1/seller
```

---

## 📦 Product Management (CRUD)

### 1. Get Seller Products
**GET** `/api/v1/seller/products`

Get paginated list of seller's products.

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20) - Items per page
- `isActive` (boolean, optional) - Filter by active status
- `search` (string, optional) - Search by name or description

**Response:**
```json
{
  "status": "success",
  "message": "Products retrieved successfully",
  "data": {
    "products": [...],
    "total": 100,
    "page": 1,
    "totalPages": 5
  }
}
```

### 2. Create Product
**POST** `/api/v1/seller/products`

Create a new product (simple or variable).

**Request Body:**
```json
{
  "productType": "simple" | "variable",
  "name": "Product Name",
  "description": "Product Description",
  "category": "categoryId",
  "brand": "Brand Name",
  "price": 99.99,
  "originalPrice": 149.99,
  "quantityAvailable": 100,
  "images": ["url1", "url2"],
  // ... other product fields
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Product created successfully",
  "data": { /* product object */ }
}
```

### 3. Update Product
**PUT** `/api/v1/seller/products/:id`

Update a product (only if owned by seller).

**URL Parameters:**
- `id` (string) - Product ID

**Request Body:**
```json
{
  "name": "Updated Name",
  "price": 89.99,
  "isActive": true,
  // ... other updatable fields
}
```

**Note:** `owner` field cannot be changed.

**Response:**
```json
{
  "status": "success",
  "message": "Product updated successfully",
  "data": { /* updated product */ }
}
```

### 4. Delete Product
**DELETE** `/api/v1/seller/products/:id`

Delete a product (only if owned by seller).

**URL Parameters:**
- `id` (string) - Product ID

**Response:**
```json
{
  "status": "success",
  "message": "Product deleted successfully"
}
```

---

## 📋 Orders (Read-Only)

### 5. Get Seller Orders
**GET** `/api/v1/seller/orders`

Get paginated list of orders containing seller's products.

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20) - Items per page
- `status` (string, optional) - Filter by order status (PENDING, PROCESSING, SHIPPED, COMPLETE, CANCELLED)

**Response:**
```json
{
  "status": "success",
  "message": "Orders retrieved successfully",
  "data": {
    "orders": [...],
    "total": 50,
    "page": 1,
    "totalPages": 3
  }
}
```

**Note:** Only items from seller's products are included in each order.

### 6. Get Order by ID
**GET** `/api/v1/seller/orders/:id`

Get a specific order (only if it contains seller's products).

**URL Parameters:**
- `id` (string) - Order ID

**Response:**
```json
{
  "status": "success",
  "message": "Order retrieved successfully",
  "data": { /* order object with filtered items */ }
}
```

---

## 💰 Bids (Read-Only)

### 7. Get Seller Bids
**GET** `/api/v1/seller/bids`

Get paginated list of bids on seller's products.

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20) - Items per page
- `status` (string, optional) - Filter by bid status (PENDING, ACCEPTED, DECLINED)

**Response:**
```json
{
  "status": "success",
  "message": "Bids retrieved successfully",
  "data": {
    "bids": [...],
    "total": 30,
    "page": 1,
    "totalPages": 2
  }
}
```

---

## 👤 Profile Management

### 8. Get Seller Profile
**GET** `/api/v1/seller/profile`

Get seller's profile information.

**Response:**
```json
{
  "status": "success",
  "message": "Profile retrieved successfully",
  "data": {
    "id": "sellerId",
    "name": "Shop Name",
    "type": "individual" | "company",
    "logo": "logoUrl",
    "official": true,
    "status": "active",
    "rating": 4.5,
    "noOfRating": 100,
    "user": { /* user info */ }
  }
}
```

### 9. Update Seller Profile
**PUT** `/api/v1/seller/profile`

Update seller's profile.

**Request Body:**
```json
{
  "name": "Updated Shop Name",
  "logo": "newLogoUrl",
  "type": "company",
  "status": "active"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Profile updated successfully",
  "data": { /* updated profile */ }
}
```

---

## 📊 Statistics

### 10. Get Seller Statistics
**GET** `/api/v1/seller/stats`

Get seller's statistics (products, orders, bids, earnings).

**Response:**
```json
{
  "status": "success",
  "message": "Statistics retrieved successfully",
  "data": {
    "products": {
      "total": 150,
      "active": 120
    },
    "orders": {
      "total": 500,
      "pending": 10,
      "completed": 480
    },
    "bids": {
      "total": 200,
      "pending": 15,
      "accepted": 50
    },
    "earnings": {
      "total": 50000
    }
  }
}
```

---

## 💵 Earnings

### 11. Get Seller Earnings
**GET** `/api/v1/seller/earnings`

Get seller's earnings with filtering and pagination.

**Query Parameters:**
- `from` (date, optional) - Start date (YYYY-MM-DD)
- `to` (date, optional) - End date (YYYY-MM-DD)
- `productId` (string, optional) - Filter by product ID
- `status` (string, optional) - Filter by payout status (PENDING, PROCESSED, FAILED)
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20) - Items per page

**Response:**
```json
{
  "status": "success",
  "message": "Earnings retrieved successfully",
  "data": {
    "payouts": [...],
    "total": 100,
    "page": 1,
    "totalPages": 5,
    "totalEarnings": 50000
  }
}
```

### 12. Export Earnings as CSV
**GET** `/api/v1/seller/earnings/export`

Export seller's earnings as CSV file.

**Query Parameters:**
- `from` (date, optional) - Start date
- `to` (date, optional) - End date

**Response:** CSV file download

---

## 🔒 Security Notes

1. **Product Ownership Verification:**
   - All product operations (update, delete) verify that the product belongs to the seller
   - Returns 403 Forbidden if seller tries to modify another seller's product

2. **Automatic Owner Assignment:**
   - When creating a product, the `owner` field is automatically set to the seller's ID
   - Cannot be changed via update endpoint

3. **Order Filtering:**
   - Orders only show items from seller's products
   - Other items in the same order are filtered out

4. **Bid Filtering:**
   - Only shows bids on seller's products

---

## Error Responses

### 401 Unauthorized
```json
{
  "status": "error",
  "message": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "status": "error",
  "message": "You do not have permission to update this product"
}
```

### 404 Not Found
```json
{
  "status": "error",
  "message": "Product not found"
}
```

### 400 Bad Request
```json
{
  "status": "error",
  "message": "Validation error message"
}
```

---

## Example Usage

### Create a Simple Product
```bash
curl -X POST https://api.example.com/api/v1/seller/products \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "productType": "simple",
    "name": "New Product",
    "description": "Product description",
    "category": "categoryId",
    "brand": "Brand Name",
    "price": 99.99,
    "originalPrice": 149.99,
    "quantityAvailable": 100,
    "images": ["url1", "url2"],
    "isActive": true
  }'
```

### Update Product
```bash
curl -X PUT https://api.example.com/api/v1/seller/products/productId \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 89.99,
    "isActive": false
  }'
```

### Get Orders
```bash
curl -X GET "https://api.example.com/api/v1/seller/orders?page=1&limit=20&status=PENDING" \
  -H "Authorization: Bearer <token>"
```

