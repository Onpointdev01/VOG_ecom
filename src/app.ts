import express, { Request, Response } from 'express';
import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import cors from 'cors';
import morgan from 'morgan';

import { env } from './config';
import './controllers';

const { NODE_ENV } = env;
const container = new Container();

// const app = express();

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
      message: 'This endpoint does not exist on this server',
    });
  });
});
// app.get('/', (req, res) => {
//   res.send('Hello World!');
// });

const app = server.build();
export { container };

export default app;
