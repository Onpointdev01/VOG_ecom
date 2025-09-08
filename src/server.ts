import 'reflect-metadata';
import app from './app';
import connectToDB from './db/connect';

import dotenv from 'dotenv';
import logger from './utils/logger';
// import { PaymentOption } from './models';

dotenv.config();

const { PORT } = process.env;

const startServer = async () => {
  await connectToDB();

  app.listen(PORT || 6000, () => {
    if (process.env.NODE_ENV !== 'test') {
      logger.info(`
                ################################################
                🛡️  Server listening on port: ${PORT} 🛡️
                ################################################
                SERVER IN ${process.env.NODE_ENV as string} MODE
              `);
    }
  });
};

startServer();

export default app;
