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
import { IUser } from './models';
import TYPES from './di';
import { User, Category } from './models';
import { IAuthService, AuthService } from './services';
import { ICategory } from './models/Category';

const { NODE_ENV } = env;
const container = new Container();

// bind all models to the container
container.bind<Model<IUser>>(TYPES.User).toConstantValue(User);
container.bind<Model<ICategory>>(TYPES.Category).toConstantValue(Category);

// bind all services to the container
container.bind<IAuthService>(TYPES.AuthService).to(AuthService);

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
