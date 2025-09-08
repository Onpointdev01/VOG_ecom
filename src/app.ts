// src/app.ts
import 'reflect-metadata';
import express, { Request, Response } from 'express';
import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import { Model } from 'mongoose';
import jwt from 'jsonwebtoken'; // ⬅️ added

import { env } from './config';

// ✅ load all “normal” controllers (no SSE controller needed now)
import './controllers';

import errorMiddleWare from './utils/errors/errorHandler';
import {
  Address, IAddress,
  Admin, IAdmin,
  Category, ICategory,
  Product, IProduct,
  ProductVariant, IProductVariant,
  Review, IReview,
  Seller, ISeller,
  User, IUser,
  Cart, ICart,
  PaymentOption, IPaymentOption,
  Payment, IPayment,
  IBid, Bid,
  IBidMessages, Message,
  IOrder, Order,
  UserView, IUserView,
} from './models';
import TYPES from './di';

import {
  IAuthService, AuthService,
  IAdminService, AdminService,
  ICategoryService, CategoryService,
  IProductService, ProductService,
  IReviewService, ReviewService,
  IUserService, UserService,
  IAddressService, AddressService,
  ICartService, CartService,
  IPaymentOptionService, PaymentOptionService,
  PaymentService,
  IProductBidService, ProductBidService,
  IBidMessageService, BidMessageService,
  OrderService,
  IViewTrackingService, ViewTrackingService,
} from './services';
import { OptionalAuth, RequireAdmin, RequireSeller, RequireSignIn } from './middlewares/AuthMiddleware';
import { streamController } from './realtime/StreamController'; // ⬅️ added

const { NODE_ENV } = env;
const container = new Container();

// ---- DI: Models
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

// ---- DI: Middlewares
container.bind<RequireSignIn>(TYPES.RequireSignIn).to(RequireSignIn);
container.bind<RequireSeller>(TYPES.RequireSeller).to(RequireSeller);
container.bind<RequireAdmin>(TYPES.RequireAdmin).to(RequireAdmin);
container.bind<OptionalAuth>(TYPES.OptionalAuth).to(OptionalAuth);

// ---- DI: Services
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

const server = new InversifyExpressServer(container);

// keep this in sync with your frontend
const SSE_PATH = '/api/v1/stream/events';

server.setConfig((app) => {
  app.set('trust proxy', 1);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(cors({ origin: true, credentials: false }));

  // Disable compression for SSE, or events will be buffered
  app.use(
    compression({
      filter: (req, res) => {
        if (req.path === SSE_PATH) return false;
        return compression.filter(req, res);
      },
    })
  );

  // Ask proxies not to buffer the stream
  app.use((req, res, next) => {
    if (req.path === SSE_PATH) {
      res.setHeader('X-Accel-Buffering', 'no');
    }
    next();
  });

  if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }

  // --- ✅ SSE endpoint as a plain Express route (no decorators)
  app.get(SSE_PATH, (req: Request, res: Response) => {
    // token can come from query ?token=... or Authorization: Bearer ...
    const qToken = (req.query.token as string) || '';
    const hToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const token = (qToken || hToken || '').trim();

    if (!token) {
      res.status(401).json({ status: 'error', message: 'Missing token' });
      return;
    }

    let userId = '';
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { id?: string; _id?: string };
      userId = String(payload.id || payload._id || '');
      if (!userId) throw new Error('no id');
    } catch {
      res.status(401).json({ status: 'error', message: 'Invalid token' });
      return;
    }

    // Hand off to the stream controller (sets headers, ka, cleanup, etc.)
    streamController.addClient(userId, res);

    // tiny hello
    try {
      res.write(`event: ping\n`);
      res.write(`data: {"ok":true,"connected":"${new Date().toISOString()}"}\n\n`);
    } catch {}
  });

  // optional health check
  app.get('/healthz', (_req: Request, res: Response) => res.json({ ok: true }));
});

server.setErrorConfig((app) => {
  app.all('*', (_req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      message: 'This endpoint does not exist on this server',
    });
  });

  app.use(errorMiddleWare);
});

const app = server.build();

export { container };
export default app;
