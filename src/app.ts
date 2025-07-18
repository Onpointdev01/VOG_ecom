import 'reflect-metadata';
import express, { Request, Response } from 'express';
import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import cors from 'cors';
import morgan from 'morgan';
import { Model } from 'mongoose';

import { env } from './config';
import './controllers';
import errorMiddleWare from './utils/errors/errorHandler';
import {
  Address,
  IAddress,
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
  IBid,
  Bid,
  IBidMessages,
  Message,
  IOrder,
  Order,
} from './models';
import TYPES from './di';

import {
  IAuthService,
  AuthService,
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
  IProductBidService,
  ProductBidService,
  IBidMessageService,
  BidMessageService,
  OrderService,
} from './services';
import { OptionalAuth, RequireSeller, RequireSignIn } from './middlewares/AuthMiddleware';

const { NODE_ENV } = env;
const container = new Container();

// Bind all models to the container
container.bind<Model<IUser>>(TYPES.User).toConstantValue(User);
container.bind<Model<ICategory>>(TYPES.Category).toConstantValue(Category);
container.bind<Model<IProduct>>(TYPES.Product).toConstantValue(Product);
container.bind<Model<IProductVariant>>(TYPES.ProductVariant).toConstantValue(ProductVariant);
container.bind<Model<IReview>>(TYPES.Review).toConstantValue(Review);
container.bind<Model<ISeller>>(TYPES.Seller).toConstantValue(Seller);
container.bind<Model<IAddress>>(TYPES.Address).toConstantValue(Address);
container.bind<Model<ICart>>(TYPES.Cart).toConstantValue(Cart);
container.bind<Model<IPaymentOption>>(TYPES.PaymentOption).toConstantValue(PaymentOption);
container.bind<Model<IBid>>(TYPES.Bid).toConstantValue(Bid);
container.bind<Model<IBidMessages>>(TYPES.BidMessages).toConstantValue(Message);
container.bind<Model<IOrder>>(TYPES.Order).toConstantValue(Order);

container.bind<RequireSignIn>(TYPES.RequireSignIn).to(RequireSignIn);
container.bind<RequireSeller>(TYPES.RequireSeller).to(RequireSeller);
container.bind<OptionalAuth>(TYPES.OptionalAuth).to(OptionalAuth);

// Bind all services to the container
container.bind<IAuthService>(TYPES.AuthService).to(AuthService);
container.bind<ICategoryService>(TYPES.CategoryService).to(CategoryService);
container.bind<IProductService>(TYPES.ProductService).to(ProductService);
container.bind<IReviewService>(TYPES.ReviewService).to(ReviewService);
container.bind<IUserService>(TYPES.UserService).to(UserService);
container.bind<IAddressService>(TYPES.AddressService).to(AddressService);
container.bind<ICartService>(TYPES.CartService).to(CartService);
container.bind<IPaymentOptionService>(TYPES.PaymentOptionService).to(PaymentOptionService);
container.bind<IProductBidService>(TYPES.ProductBidService).to(ProductBidService);
container.bind<IBidMessageService>(TYPES.BidMessageService).to(BidMessageService);
container.bind<OrderService>(TYPES.OrderService).to(OrderService);

const server = new InversifyExpressServer(container);

server.setConfig((app) => {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(cors());
  if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }
});

server.setErrorConfig((app) => {
  app.all('*', (req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      message: 'This endpoint does not exist on this server',
    });
  });

  // Add MongoDB error handler before the general error middleware
  // app.use(mongoErrorHandler);
  app.use(errorMiddleWare);
});

const app = server.build();
export { container };
export default app;
