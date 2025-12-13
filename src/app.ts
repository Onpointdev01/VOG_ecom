import 'reflect-metadata';
import express, { Request, Response } from 'express';
import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { Model } from 'mongoose';

import { env } from './config';
import './controllers';
import errorMiddleWare from './utils/errors/errorHandler';
import multerErrorHandler from './middlewares/multerErrorHandler';
import {
  Address,
  IAddress,
  Admin,
  IAdmin,
  Category,
  ICategory,
  Product,
  IProduct,
  ProductVariant,
  IProductVariant,
  Review,
  IReview,
  Seller,
  ISeller,
  User,
  IUser,
  Cart,
  ICart,
  PaymentOption,
  IPaymentOption,
  Payment,
  IPayment,
  IBid,
  Bid,
  IBidMessages,
  Message,
  IOrder,
  Order,
  UserView,
  IUserView,
  ShippingZone,
  IShippingZone,
  Attribute,
  IAttribute,
  AttributeValue,
  IAttributeValue,
  INotification,
  ITokenBlacklist,
  IPayout,
  IAuditLog,
  IBidOffer,
} from './models';
import Notification from './models/Notification';
import { TokenBlacklist } from './models/TokenBlacklist';
import { Payout } from './models/Payout';
import { AuditLog } from './models/AuditLog';
import { BidOffer } from './models/BidOffer';
import TYPES from './di';

import {
  IAuthService,
  AuthService,
  IAdminService,
  AdminService,
  ICategoryService,
  CategoryService,
  IProductService,
  ProductService,
  IReviewService,
  ReviewService,
  IUserService,
  UserService,
  IAddressService,
  AddressService,
  ICartService,
  CartService,
  IPaymentOptionService,
  PaymentOptionService,
  PaymentService,
  IProductBidService,
  ProductBidService,
  IBidMessageService,
  BidMessageService,
  OrderService,
  IViewTrackingService,
  ViewTrackingService,
  IShippingZoneService,
  ShippingZoneService,
  IAttributeService,
  AttributeService,
  IAttributeValueService,
  AttributeValueService,
  ISellerService,
  SellerService,
  IPayoutService,
  PayoutService,
  ISKUService,
  SKUService,
  ITranslationService,
  TranslationService,
} from './services';
import { NotificationService } from './services/NotificationService';
import { WebSocketService } from './services/WebSocketService';
import { OptionalAuth, RequireAdmin, RequireSeller, RequireSignIn, RequireAuth } from './middlewares/AuthMiddleware';

const { NODE_ENV } = env;
const container = new Container();

// Bind all models to the container
container.bind<Model<IUser>>(TYPES.User).toConstantValue(User);
container.bind<Model<IAdmin>>(TYPES.Admin).toConstantValue(Admin);
container.bind<Model<ICategory>>(TYPES.Category).toConstantValue(Category);
container.bind<Model<IProduct>>(TYPES.Product).toConstantValue(Product);
container.bind<Model<IProductVariant>>(TYPES.ProductVariant).toConstantValue(ProductVariant);
container.bind<Model<IReview>>(TYPES.Review).toConstantValue(Review);
container.bind<Model<ISeller>>(TYPES.Seller).toConstantValue(Seller);
container.bind<Model<IAddress>>(TYPES.Address).toConstantValue(Address);
container.bind<Model<ICart>>(TYPES.Cart).toConstantValue(Cart);
container.bind<Model<IPaymentOption>>(TYPES.PaymentOption).toConstantValue(PaymentOption);
container.bind<Model<IPayment>>(TYPES.Payment).toConstantValue(Payment);
container.bind<Model<IBid>>(TYPES.Bid).toConstantValue(Bid);
container.bind<Model<IBidMessages>>(TYPES.BidMessages).toConstantValue(Message);
container.bind<Model<IOrder>>(TYPES.Order).toConstantValue(Order);
container.bind<Model<IUserView>>(TYPES.UserView).toConstantValue(UserView);
container.bind<Model<IShippingZone>>(TYPES.ShippingZone).toConstantValue(ShippingZone);
container.bind<Model<IAttribute>>(TYPES.Attribute).toConstantValue(Attribute);
container.bind<Model<IAttributeValue>>(TYPES.AttributeValue).toConstantValue(AttributeValue);
container.bind<Model<INotification>>(TYPES.Notification).toConstantValue(Notification);
container.bind<Model<ITokenBlacklist>>(TYPES.TokenBlacklist).toConstantValue(TokenBlacklist);
container.bind<Model<IPayout>>(TYPES.Payout).toConstantValue(Payout);
container.bind<Model<IAuditLog>>(TYPES.AuditLog).toConstantValue(AuditLog);
container.bind<Model<IBidOffer>>(TYPES.BidOffer).toConstantValue(BidOffer);

container.bind<RequireSignIn>(TYPES.RequireSignIn).to(RequireSignIn);
container.bind<RequireSeller>(TYPES.RequireSeller).to(RequireSeller);
container.bind<RequireAdmin>(TYPES.RequireAdmin).to(RequireAdmin);
container.bind<RequireAuth>(TYPES.RequireAuth).to(RequireAuth);
container.bind<OptionalAuth>(TYPES.OptionalAuth).to(OptionalAuth);

// Bind all services to the container
container.bind<IAuthService>(TYPES.AuthService).to(AuthService);
container.bind<IAdminService>(TYPES.AdminService).to(AdminService);
container.bind<ICategoryService>(TYPES.CategoryService).to(CategoryService);
container.bind<IProductService>(TYPES.ProductService).to(ProductService);
container.bind<IReviewService>(TYPES.ReviewService).to(ReviewService);
container.bind<IUserService>(TYPES.UserService).to(UserService);
container.bind<IAddressService>(TYPES.AddressService).to(AddressService);
container.bind<ICartService>(TYPES.CartService).to(CartService);
container.bind<IPaymentOptionService>(TYPES.PaymentOptionService).to(PaymentOptionService);
container.bind<PaymentService>(TYPES.PaymentService).to(PaymentService);
container.bind<IProductBidService>(TYPES.ProductBidService).to(ProductBidService);
container.bind<IBidMessageService>(TYPES.BidMessageService).to(BidMessageService);
container.bind<OrderService>(TYPES.OrderService).to(OrderService);
container.bind<IViewTrackingService>(TYPES.ViewTrackingService).to(ViewTrackingService);
container.bind<IShippingZoneService>(TYPES.ShippingZoneService).to(ShippingZoneService);
container.bind<IAttributeService>(TYPES.AttributeService).to(AttributeService);
container.bind<IAttributeValueService>(TYPES.AttributeValueService).to(AttributeValueService);
container.bind<ISellerService>(TYPES.SellerService).to(SellerService);
container.bind<NotificationService>(TYPES.NotificationService).to(NotificationService);
container.bind<WebSocketService>(TYPES.WebSocketService).to(WebSocketService).inSingletonScope();
container.bind<IPayoutService>(TYPES.PayoutService).to(PayoutService);
container.bind<ISKUService>(TYPES.SKUService).to(SKUService);
container.bind<ITranslationService>(TYPES.TranslationService).to(TranslationService);

const server = new InversifyExpressServer(container);

server.setConfig((app) => {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser()); // Enable cookie parsing for refresh tokens

  // CORS configuration: When credentials are enabled, origin cannot be '*'
  // Must specify exact origins or use a function to dynamically allow origins
  const envOrigins = process.env.FRONTEND_URL 
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : [];
  
  // Always include production Vercel domains
  const defaultLocalhostPorts = [
    'https://stcaeladmin.vercel.app',
    'https://st-cael-seller.vercel.app',
    'https://st-cael-website.vercel.app'
  ];
  const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultLocalhostPorts])); // Remove duplicates

  console.log('🔒 CORS Configuration:', {
    allowedOrigins,
    nodeEnv: NODE_ENV,
    credentials: true
  });

  // CORS middleware - MUST be before other routes
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, or curl)
      if (!origin) {
        console.log('✅ CORS: Allowing request with no origin');
        return callback(null, true);
      }
      
      console.log(`🔍 CORS: Checking origin: ${origin}`);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        console.log(`✅ CORS: Origin ${origin} is in allowed list`);
        callback(null, true);
      } else {
        // Allow any localhost origin (for local development in both dev and production mode)
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          console.log(`✅ CORS: Allowing localhost origin: ${origin}`);
          callback(null, true);
        } else {
          console.log(`❌ CORS: Rejecting origin: ${origin}`);
          callback(new Error(`Not allowed by CORS: ${origin}`));
        }
      }
    },
    credentials: true, // Allow cookies to be sent
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers'
    ],
    exposedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204, // Some legacy browsers (IE11, various SmartTVs) choke on 204
  }));

  // Explicitly handle OPTIONS requests for all routes (preflight)
  // Use the same CORS configuration
  const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps, Postman, or curl)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Allow any localhost origin (for local development in both dev and production mode)
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          callback(null, true);
        } else {
          callback(new Error(`Not allowed by CORS: ${origin}`));
        }
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers'
    ],
    exposedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  };
  
  app.options('*', cors(corsOptions));
  if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }

  // Setup Swagger documentation (only in development)
  if (NODE_ENV === 'development' || process.env.ENABLE_SWAGGER === 'true') {
    try {
      const { setupSwagger } = require('./swagger/swagger');
      setupSwagger(app);
    } catch (error) {
      console.warn('Swagger setup failed (optional):', error);
    }
  }
});

server.setErrorConfig((app) => {
  // Add multer error handler FIRST to catch multer-specific errors
  app.use(multerErrorHandler);
  
  // Add error middleware BEFORE the catch-all 404 handler
  // This ensures errors from controllers/middlewares are handled properly
  app.use(errorMiddleWare);
  
  // Catch-all 404 handler - must be last
  app.all('*', (req: Request, res: Response) => {
    console.log(`[404] Route not found: ${req.method} ${req.url}`);
    res.status(404).json({
      status: 'error',
      message: 'This endpoint does not exist on this server',
    });
  });
});

const app = server.build();
export { container };
export default app;
