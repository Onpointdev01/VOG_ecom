import 'reflect-metadata';
import dns from 'dns';
import app from './app';
import connectToDB from './db/connect';
import { createServer } from 'http';
import { container } from './app';
import TYPES from './di';
import { WebSocketService } from './services/WebSocketService';
import { NotificationService } from './services/NotificationService';
import { IPayoutService } from './services/PayoutService';
import { IProductService } from './services/ProductService';

import dotenv from 'dotenv';
import logger from './utils/logger';
// import { PaymentOption } from './models';

dotenv.config();

// Force Node.js to use reliable public DNS
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Global error handlers to prevent server crashes from unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  // Log the error but don't crash the server
  const errorMessage = reason?.message || String(reason || '');
  const statusCode = reason?.statusCode;
  
  // If it's an operational error (like AppError with 404), suppress "user not found" errors
  // These are expected when users are deleted but orders/bids still reference them
  if (reason?.isOperational && statusCode) {
    if (errorMessage.toLowerCase().includes('user not found')) {
      // Silently ignore "user not found" errors - they're handled gracefully in the code
      return;
    }
    logger.warn(`Unhandled promise rejection (operational error): ${errorMessage} (${statusCode})`);
    return;
  }
  
  // For other errors, log with more detail
  logger.error('Unhandled promise rejection:', {
    reason: errorMessage,
    stack: reason?.stack,
    statusCode,
    isOperational: reason?.isOperational,
  });
});

process.on('uncaughtException', (error: Error) => {
  // Log the error but don't crash the server
  logger.error('Uncaught exception:', {
    message: error.message,
    stack: error.stack,
    name: error.name,
  });
  
  // Only exit if it's a critical error
  if (!error.message.includes('user not found') && !error.message.includes('User not found')) {
    logger.error('Critical error, exiting...');
    process.exit(1);
  }
});

const { PORT } = process.env;

const startServer = async () => {
  await connectToDB();

  // Create HTTP server
  const httpServer = createServer(app);

  // Initialize WebSocket service (async for Redis connection)
  const webSocketService = container.get<WebSocketService>(TYPES.WebSocketService);
  await webSocketService.initialize(httpServer);

  // Inject WebSocketService into NotificationService
  const notificationService = container.get<NotificationService>(TYPES.NotificationService);
  notificationService.setWebSocketService(webSocketService);

  // Inject NotificationService into PayoutService
  const payoutService = container.get<IPayoutService>(TYPES.PayoutService);
  payoutService.setNotificationService(notificationService);

  // Inject NotificationService into ProductService
  const productService = container.get<IProductService>(TYPES.ProductService);
  if ('setNotificationService' in productService) {
    (productService as any).setNotificationService(notificationService);
  }

  // Store WebSocketService globally for easy access (optional, for backward compatibility)
  (global as any).webSocketService = webSocketService;

  const port = PORT ? parseInt(PORT, 10) : 6000;
  httpServer.listen(port, '0.0.0.0', () => {
    if (process.env.NODE_ENV !== 'test') {
      logger.info(`
                ################################################
                🛡️  Server listening on port: ${port} 🛡️
                🌐 Listening on 0.0.0.0 (all interfaces)
                ################################################
                SERVER IN ${process.env.NODE_ENV as string} MODE
                🔌 WebSocket server initialized
              `);
    }
  });
};

startServer();

export default app;
