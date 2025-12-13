# Starting the Server

## Quick Start

### Option 1: Development Mode (Recommended)
```bash
cd VOG_ecom
npm run dev
```

### Option 2: Production Mode
```bash
cd VOG_ecom
npm run build
npm start
```

## Server Information

- **Default Port**: 6000
- **Environment Variable**: `PORT` (if set)
- **API Base URL**: `http://localhost:6000`
- **API Documentation**: `http://localhost:6000/api-docs`
- **WebSocket**: Same port (Socket.IO)

## Prerequisites

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   - Ensure `.env` file exists with required variables
   - See `DEPLOYMENT_NOTES.md` for full list

3. **Database**
   - MongoDB must be running
   - Connection string in `MONGO_URL`

4. **Optional: Redis** (for Socket.IO scaling)
   - Redis server running if using multi-instance
   - Connection string in `REDIS_URL`

## Verify Server is Running

### Check Health Endpoint
```bash
curl http://localhost:6000/
```

### Check API Documentation
Open browser: `http://localhost:6000/api-docs`

### Check Logs
Server logs will show:
- Database connection status
- Server port
- WebSocket initialization
- Any errors

## Troubleshooting

### Port Already in Use
```bash
# Windows
netstat -ano | findstr :6000

# Kill process if needed
taskkill /PID <PID> /F
```

### Database Connection Error
- Check MongoDB is running
- Verify `MONGO_URL` in `.env`
- Check network connectivity

### Module Not Found
```bash
npm install
```

### TypeScript Errors
```bash
npm run build
```

## Background Process

To run in background (Windows PowerShell):
```powershell
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd VOG_ecom; npm run dev"
```

## Stop Server

- Press `Ctrl+C` in the terminal
- Or kill the Node process

