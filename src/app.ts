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
import { Category, ICategory, IProduct, IReview, ISeller, IUser, Product, Review, Seller, User } from './models';
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
} from './services';
import { RequireSeller, RequireSignIn } from './middlewares/AuthMiddleware';

const { NODE_ENV } = env;
const container = new Container();

// Bind all models to the container
container.bind<Model<IUser>>(TYPES.User).toConstantValue(User);
container.bind<Model<ICategory>>(TYPES.Category).toConstantValue(Category);
container.bind<Model<IProduct>>(TYPES.Product).toConstantValue(Product);
container.bind<Model<IReview>>(TYPES.Review).toConstantValue(Review);
container.bind<Model<ISeller>>(TYPES.Seller).toConstantValue(Seller);

container.bind<RequireSignIn>(TYPES.RequireSignIn).to(RequireSignIn);
container.bind<RequireSeller>(TYPES.RequireSeller).to(RequireSeller);

// Bind all services to the container
container.bind<IAuthService>(TYPES.AuthService).to(AuthService);
container.bind<ICategoryService>(TYPES.CategoryService).to(CategoryService);
container.bind<IProductService>(TYPES.ProductService).to(ProductService);
container.bind<IReviewService>(TYPES.ReviewService).to(ReviewService);

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

  app.use(errorMiddleWare);
});

const app = server.build();
export { container };
export default app;
