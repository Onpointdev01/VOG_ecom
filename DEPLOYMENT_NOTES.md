# Deployment Notes

## Prerequisites

### Environment Variables

Add the following to your `.env` file:

```env
# Database
MONGO_URL=mongodb://localhost:27017/vog_ecom

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRES=15m
JWT_REFRESH_SECRET=your-refresh-secret-key-here
JWT_REFRESH_EXPIRES=7d

# AWS S3 (for file uploads)
BUCKET_NAME=your-bucket-name
ACCESS_KEY_ID=your-access-key
SECRET_ACCESS_KEY=your-secret-key

# Frontend URL (for CORS and email links)
FRONTEND_URL=http://localhost:3000

# Gmail SMTP (optional, for password reset)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password

# Redis (optional, for Socket.IO scaling)
REDIS_URL=redis://localhost:6379

# Web Push VAPID (optional, for browser push notifications)
VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
VAPID_SUBJECT=mailto:your-email@example.com

# App Name
APP_NAME=VOG E-commerce
```

### Required Dependencies

Install new dependencies:

```bash
npm install cookie-parser express-rate-limit @socket.io/redis-adapter redis
npm install --save-dev @types/cookie-parser @types/express-rate-limit
```

For Gmail SMTP (optional):
```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

## Database Migrations

### 1. Run Bid Status Migration

Before deploying, run the migration to update bid statuses:

```bash
# Development
ts-node migrations/001_update_bid_statuses.ts

# Production (after building)
node dist/migrations/001_update_bid_statuses.js
```

### 2. Verify New Collections

The following collections will be created automatically on first use:
- `tokenblacklists` - For refresh token blacklisting
- `payouts` - For seller payouts
- `auditlogs` - For audit trails
- `bidoffers` - For counter-offers

### 3. Update Existing Notifications

If you have existing notifications, you may want to add the `channel` field:

```javascript
db.notifications.updateMany(
  { channel: { $exists: false } },
  { $set: { channel: 'in-app' } }
);
```

## Deployment Steps

### 1. Build the Application

```bash
npm run build
```

### 2. Set Up Redis (Optional but Recommended)

For production with multiple instances, set up Redis:

```bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Or use a managed Redis service (AWS ElastiCache, Redis Cloud, etc.)
```

### 3. Set Up Gmail App Password (Optional)

If using Gmail SMTP:

1. Go to Google Account settings
2. Enable 2-Step Verification
3. Generate an App Password
4. Use the app password in `GMAIL_APP_PASSWORD`

### 4. Start the Server

```bash
# Production
npm start

# Development
npm run dev
```

### 5. Verify Health

Check that the server is running:
- API: `http://localhost:6000/`
- WebSocket: Should connect on the same port

## Breaking Changes

### 1. Bid Status Values

**Action Required**: Run migration script before deploying.

Old statuses: `PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED`
New statuses: `open`, `countered`, `accepted_by_admin`, `declined_by_admin`, `expired`, `cancelled`

### 2. Refresh Token Storage

**Frontend Update Required**: Refresh tokens are now stored in httpOnly cookies.

- Old: Send refresh token in request body
- New: Refresh token automatically sent via cookie
- Backward compatibility: Still accepts token in body/header as fallback

### 3. Password Reset

**Frontend Update Required**: Password reset now uses secure tokens instead of codes.

- Old: `POST /api/v1/auth/reset-password` with `{ email, code, password }`
- New: `POST /api/v1/auth/reset-password` with `{ token, password }`
- Token is sent in email link: `/reset-password?token=xxx`

### 4. Admin Registration

**Security**: Admin accounts can no longer be created through public signup.

- Old: Anyone could sign up as admin
- New: Admin accounts must be created by existing admin or through secure seed

## API Changes

### New Endpoints

#### Seller Earnings
- `GET /api/v1/seller/earnings` - Get seller earnings with filters
- `GET /api/v1/seller/earnings/export` - Export earnings as CSV

#### Auth
- `POST /api/v1/auth/logout` - Logout and blacklist refresh token

### Updated Endpoints

#### Auth
- `POST /api/v1/auth/login` - Now sets httpOnly cookie for refresh token
- `POST /api/v1/auth/refresh-token` - Now reads from cookie, rotates token
- `POST /api/v1/auth/forgot-password` - Now uses secure tokens, rate limited
- `POST /api/v1/auth/reset-password` - Now accepts token instead of code
- `POST /api/v1/auth/signup` - Now requires email verification, prevents admin signup

## Rate Limiting

The following endpoints are now rate limited:

- `/api/v1/auth/login` - 5 requests per 15 minutes
- `/api/v1/auth/forgot-password` - 3 requests per hour
- General API - 100 requests per 15 minutes
- Bid creation - 10 requests per minute

## Monitoring

### Check Token Blacklist

```javascript
// MongoDB query to check blacklisted tokens
db.tokenblacklists.find({ expiresAt: { $gt: new Date() } }).count()
```

### Check Payouts

```javascript
// MongoDB query to check pending payouts
db.payouts.find({ status: 'PENDING' }).count()
```

### Check Audit Logs

```javascript
// MongoDB query to check recent audit logs
db.auditlogs.find().sort({ createdAt: -1 }).limit(10)
```

## Troubleshooting

### Issue: Refresh tokens not working

**Solution**: 
1. Check that `cookie-parser` is installed and configured
2. Verify CORS allows credentials: `credentials: true`
3. Check that cookies are being sent (browser DevTools)

### Issue: Gmail SMTP not working

**Solution**:
1. Verify `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set
2. Ensure 2-Step Verification is enabled on Google account
3. Check that app password is correct (not regular password)

### Issue: Redis adapter not connecting

**Solution**:
1. Verify `REDIS_URL` is correct
2. Check Redis server is running
3. Application will continue without Redis (single instance mode)

### Issue: Payouts not created

**Solution**:
1. Verify order status is `COMPLETE` (not `COMPLETED`)
2. Check that products have `owner` field populated
3. Check server logs for payout creation errors

## Rollback Plan

If you need to rollback:

1. **Bid Statuses**: Revert to old status enum in code
2. **Refresh Tokens**: Remove cookie-parser, use body-based tokens
3. **Password Reset**: Revert to code-based reset
4. **Database**: Restore from backup if migrations were run

## Performance Considerations

- **Redis**: Required for Socket.IO scaling across multiple instances
- **Token Blacklist**: Uses MongoDB TTL index for auto-cleanup
- **Rate Limiting**: Uses in-memory store (consider Redis for distributed systems)

## Security Checklist

- [ ] JWT secrets are strong and unique
- [ ] Gmail app password is secure (not in git)
- [ ] CORS is properly configured
- [ ] Rate limiting is enabled
- [ ] HTTPS is used in production
- [ ] httpOnly cookies are used for refresh tokens
- [ ] Admin registration is disabled in public routes

## Support

For issues or questions:
1. Check server logs
2. Review audit logs for errors
3. Check MongoDB for data consistency
4. Verify environment variables

