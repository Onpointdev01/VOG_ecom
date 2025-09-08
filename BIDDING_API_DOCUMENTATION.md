# VOG Company Bidding System API Documentation

## Overview
The VOG Company bidding system allows users to make offers on products below the listed price. Bids can be accepted by sellers or admins, and accepted bids can be added directly to the user's cart.

---

## Database Models

### Bid Schema
```javascript
{
  _id: ObjectId,
  buyer: ObjectId,           // Reference to User
  seller: ObjectId,          // Reference to User (product owner)
  product: ObjectId,         // Reference to Product
  bidAmount: Number,         // The bid amount in USD
  status: String,            // 'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'
  expiresAt: Date,          // When accepted bids expire (24 hours from acceptance)
  convertedToCart: Boolean,  // Whether bid was added to cart
  convertedAt: Date,        // When added to cart
  createdAt: Date,
  updatedAt: Date
}
```

### BidMessages Schema
```javascript
{
  _id: ObjectId,
  sender: ObjectId,     // User who sent message
  recipient: ObjectId,  // User who receives message
  product: ObjectId,    // Related product
  bid: ObjectId,       // Related bid (optional)
  type: String,        // Message type (see types below)
  message: String,     // Message content
  createdAt: Date
}
```

**Message Types:**
- `BID_PROPOSAL` - User places initial bid
- `BID_ACCEPTED` - Seller/admin accepts the bid
- `BID_REJECTED` - Seller/admin rejects the bid
- `SYSTEM` - System-generated messages
- `PRODUCT_INQUIRY` - General product questions

---

## API Endpoints

### 1. Place Bid

**Endpoint:** `POST /api/v1/bids`

**Authentication:** Required (User JWT Token)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "productId": "64f123abc456789012345678",
  "bidAmount": 150.00
}
```

**Expected Response (201 Created):**
```json
{
  "success": true,
  "message": "Bid placed successfully",
  "data": {
    "bid": {
      "_id": "64f456def789012345678901",
      "buyer": "64f789abc012345678901234",
      "seller": "64f012def345678901234567",
      "product": "64f123abc456789012345678",
      "bidAmount": 150,
      "status": "PENDING",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
```json
// 400 Bad Request - Invalid bid amount
{
  "success": false,
  "message": "Bid amount must be between 75% and 125% of product price",
  "error": "INVALID_BID_AMOUNT"
}

// 404 Not Found - Product not found
{
  "success": false,
  "message": "Product not found",
  "error": "PRODUCT_NOT_FOUND"
}

// 409 Conflict - User already has pending bid
{
  "success": false,
  "message": "You already have a pending bid on this product",
  "error": "DUPLICATE_BID"
}
```

---

### 2. Get User's Bids

**Endpoint:** `GET /api/v1/bids/my-bids`

**Authentication:** Required (User JWT Token)

**Query Parameters:**
- `status` (optional): Filter by bid status (PENDING, ACCEPTED, REJECTED, EXPIRED, CANCELLED)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Example Request:**
```
GET /api/v1/bids/my-bids?status=PENDING&page=1&limit=10
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "User bids retrieved successfully",
  "data": {
    "bids": [
      {
        "_id": "64f456def789012345678901",
        "bidAmount": 150,
        "status": "PENDING",
        "product": {
          "_id": "64f123abc456789012345678",
          "name": "Nike Air Max 270",
          "images": ["https://example.com/image1.jpg"],
          "price": 200
        },
        "seller": {
          "_id": "64f012def345678901234567",
          "name": "Sneaker Store"
        },
        "createdAt": "2024-01-15T10:30:00.000Z",
        "expiresAt": null
      }
    ],
    "total": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

---

### 3. Get Bid Messages (Chat)

**Endpoint:** `GET /api/v1/bid-messages`

**Authentication:** Required (User JWT Token)

**Query Parameters:**
- `productId` (required): Product ID to get messages for

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Example Request:**
```
GET /api/v1/bid-messages?productId=64f123abc456789012345678
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "_id": "64f789ghi012345678901234",
        "sender": "64f789abc012345678901234",
        "recipient": "64f012def345678901234567",
        "product": "64f123abc456789012345678",
        "bid": "64f456def789012345678901",
        "type": "BID_PROPOSAL",
        "message": "I'd like to offer $150 for this item",
        "createdAt": "2024-01-15T10:30:00.000Z"
      },
      {
        "_id": "64f890jkl123456789012345",
        "sender": "64f012def345678901234567",
        "recipient": "64f789abc012345678901234",
        "product": "64f123abc456789012345678",
        "bid": "64f456def789012345678901",
        "type": "BID_ACCEPTED",
        "message": "Your bid of $150 has been accepted!",
        "createdAt": "2024-01-15T11:00:00.000Z"
      }
    ]
  }
}
```

---

### 4. Accept Bid (Seller)

**Endpoint:** `PUT /api/v1/bids/{bidId}/accept`

**Authentication:** Required (Seller JWT Token - must own the product)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "message": "Great! I accept your offer." // Optional custom message
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Bid accepted successfully",
  "data": {
    "bid": {
      "_id": "64f456def789012345678901",
      "buyer": "64f789abc012345678901234",
      "seller": "64f012def345678901234567",
      "product": "64f123abc456789012345678",
      "bidAmount": 150,
      "status": "ACCEPTED",
      "expiresAt": "2024-01-16T11:00:00.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    },
    "addToCartLink": "/api/v1/bids/64f456def789012345678901/add-to-cart",
    "expiresAt": "2024-01-16T11:00:00.000Z"
  }
}
```

**Error Responses:**
```json
// 404 Not Found - Bid not found
{
  "success": false,
  "message": "Bid not found",
  "error": "BID_NOT_FOUND"
}

// 403 Forbidden - Not the product owner
{
  "success": false,
  "message": "You are not authorized to accept this bid",
  "error": "UNAUTHORIZED"
}

// 400 Bad Request - Bid already processed
{
  "success": false,
  "message": "Bid has already been accepted or rejected",
  "error": "BID_ALREADY_PROCESSED"
}
```

---

### 5. Accept Bid (Admin)

**Endpoint:** `PUT /admin/bids/{bidId}/accept`

**Authentication:** Required (Admin JWT Token)

**Request Headers:**
```
Authorization: Bearer <admin_jwt_token>
```

**Request Body:** None required

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Bid accepted successfully",
  "data": {
    "bid": {
      "_id": "64f456def789012345678901",
      "buyer": "64f789abc012345678901234",
      "seller": "64f012def345678901234567",
      "product": "64f123abc456789012345678",
      "bidAmount": 150,
      "status": "ACCEPTED",
      "expiresAt": "2024-01-16T11:00:00.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    }
  }
}
```

---

### 6. Force Accept Bid (Admin)

**Endpoint:** `PUT /admin/bids/{bidId}/force-accept`

**Authentication:** Required (Admin JWT Token)

**Request Headers:**
```
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reason": "Customer service override - special promotion" // Optional reason
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Bid force accepted successfully",
  "data": {
    "bid": {
      "_id": "64f456def789012345678901",
      "buyer": "64f789abc012345678901234",
      "seller": "64f012def345678901234567",
      "product": "64f123abc456789012345678",
      "bidAmount": 150,
      "status": "ACCEPTED",
      "expiresAt": "2024-01-16T11:00:00.000Z",
      "adminOverride": true,
      "adminReason": "Customer service override - special promotion",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    }
  }
}
```

---

### 7. Reject Bid (Admin)

**Endpoint:** `PUT /admin/bids/{bidId}/force-reject`

**Authentication:** Required (Admin JWT Token)

**Request Headers:**
```
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reason": "Bid amount too low for this premium product" // Optional reason
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Bid force rejected successfully",
  "data": {
    "bid": {
      "_id": "64f456def789012345678901",
      "buyer": "64f789abc012345678901234",
      "seller": "64f012def345678901234567",
      "product": "64f123abc456789012345678",
      "bidAmount": 150,
      "status": "REJECTED",
      "adminOverride": true,
      "adminReason": "Bid amount too low for this premium product",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    }
  }
}
```

---

### 8. Add Accepted Bid to Cart

**Endpoint:** `POST /api/v1/bids/{bidId}/add-to-cart`

**Authentication:** Required (User JWT Token - must be the bid owner)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "size": "L",    // Optional: If product has size variants
  "color": "Red"  // Optional: If product has color variants
}
```

**Expected Response (201 Created):**
```json
{
  "success": true,
  "message": "Bid item added to cart successfully",
  "data": {
    "cartItem": {
      "_id": "64f901mno234567890123456",
      "user": "64f789abc012345678901234",
      "product": "64f123abc456789012345678",
      "quantity": 1,
      "price": 150,           // Uses bid amount, not original product price
      "size": "L",
      "color": "Red",
      "fromBid": true,
      "bidId": "64f456def789012345678901",
      "createdAt": "2024-01-15T12:00:00.000Z"
    }
  }
}
```

**Error Responses:**
```json
// 404 Not Found - Bid not found or not accepted
{
  "success": false,
  "message": "Accepted bid not found",
  "error": "BID_NOT_FOUND"
}

// 403 Forbidden - Not the bid owner
{
  "success": false,
  "message": "You are not authorized to add this bid to cart",
  "error": "UNAUTHORIZED"
}

// 410 Gone - Bid expired
{
  "success": false,
  "message": "This bid has expired",
  "error": "BID_EXPIRED"
}

// 409 Conflict - Already added to cart
{
  "success": false,
  "message": "This bid has already been added to cart",
  "error": "ALREADY_IN_CART"
}
```

---

### 9. Get Bids for Product (Admin)

**Endpoint:** `GET /admin/bids`

**Authentication:** Required (Admin JWT Token)

**Query Parameters:**
- `productId` (optional): Filter by specific product
- `status` (optional): Filter by bid status
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Request Headers:**
```
Authorization: Bearer <admin_jwt_token>
```

**Example Request:**
```
GET /admin/bids?productId=64f123abc456789012345678&status=PENDING&page=1&limit=10
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "bids": [
      {
        "_id": "64f456def789012345678901",
        "bidAmount": 150,
        "status": "PENDING",
        "buyer": {
          "_id": "64f789abc012345678901234",
          "firstName": "John",
          "lastName": "Doe",
          "email": "john@example.com"
        },
        "seller": {
          "_id": "64f012def345678901234567",
          "name": "Sneaker Store"
        },
        "product": {
          "_id": "64f123abc456789012345678",
          "name": "Nike Air Max 270",
          "price": 200,
          "images": ["https://example.com/image1.jpg"]
        },
        "createdAt": "2024-01-15T10:30:00.000Z",
        "expiresAt": null
      }
    ],
    "total": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

---

### 10. Get Bid Details (Admin)

**Endpoint:** `GET /admin/bids/{bidId}`

**Authentication:** Required (Admin JWT Token)

**Request Headers:**
```
Authorization: Bearer <admin_jwt_token>
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Bid details retrieved successfully",
  "data": {
    "bid": {
      "_id": "64f456def789012345678901",
      "bidAmount": 150,
      "status": "PENDING",
      "buyer": {
        "_id": "64f789abc012345678901234",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com",
        "phone": "+1234567890"
      },
      "seller": {
        "_id": "64f012def345678901234567",
        "name": "Sneaker Store",
        "email": "store@example.com"
      },
      "product": {
        "_id": "64f123abc456789012345678",
        "name": "Nike Air Max 270",
        "price": 200,
        "images": ["https://example.com/image1.jpg"],
        "category": "Footwear"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "expiresAt": null,
      "convertedToCart": false,
      "convertedAt": null
    }
  }
}
```

---

## Business Rules

### Bid Validation Rules
- Bid amount must be between 75% and 125% of the original product price
- Users can only have one pending bid per product
- Users cannot bid on their own products

### Acceptance Rules
- Only the product owner (seller) can normally accept bids
- Admins can override and accept/reject any bid
- Accepted bids expire after 24 hours
- Expired bids cannot be added to cart

### Cart Integration Rules
- Accepted bids use the bid amount as the cart price, not the original product price
- Each bid can only be added to cart once
- Users must specify size/color if the product has variants
- Adding to cart marks the bid as `convertedToCart: true`

---

## Error Codes Reference

| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `INVALID_BID_AMOUNT` | Bid amount outside allowed range | 400 |
| `PRODUCT_NOT_FOUND` | Product doesn't exist | 404 |
| `DUPLICATE_BID` | User already has pending bid | 409 |
| `BID_NOT_FOUND` | Bid doesn't exist | 404 |
| `UNAUTHORIZED` | User lacks permission | 403 |
| `BID_ALREADY_PROCESSED` | Bid already accepted/rejected | 400 |
| `BID_EXPIRED` | Accepted bid past expiration | 410 |
| `ALREADY_IN_CART` | Bid already added to cart | 409 |
| `INVALID_TOKEN` | Authentication token invalid | 401 |
| `TOKEN_EXPIRED` | Authentication token expired | 401 |

---

## Implementation Notes

1. **Real-time Updates**: Consider implementing WebSocket connections for real-time bid status updates and chat messages.

2. **Price Display**: Always display both the original price and bid amount in the UI for clarity.

3. **Expiration Handling**: Implement client-side countdown timers for accepted bids to show remaining time.

4. **Notification System**: Send push notifications or emails when bids are accepted/rejected.

5. **Currency Formatting**: All monetary values should be formatted consistently in the UI.

6. **Mobile Optimization**: Ensure the bidding interface works well on mobile devices.

7. **Rate Limiting**: Implement rate limiting to prevent bid spam from users.

8. **Audit Trail**: Log all bid actions for administrative purposes and dispute resolution.