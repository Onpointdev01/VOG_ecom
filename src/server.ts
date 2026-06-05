import 'reflect-metadata';
import app from './app';
import connectToDB from './db/connect';

import dotenv from 'dotenv';
import logger from './utils/logger';
// import { PaymentOption } from './models';

dotenv.config();

const { PORT } = process.env;

const startServer = async () => {
  try {
    await connectToDB();

    const server = app.listen(PORT || 6000, () => {
      if (process.env.NODE_ENV !== 'test') {
        logger.info(`
                ################################################
                🛡️  Server listening on port: ${PORT} 🛡️
                ################################################
                SERVER IN ${process.env.NODE_ENV as string} MODE
              `);
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Stop the other process or change PORT in .env`);
      } else {
        logger.error(err);
      }
      process.exit(1);
    });
  } catch (err) {
    logger.error('Failed to start server (is MongoDB running?)');
    logger.error(err);
    process.exit(1);
  }
};

startServer();

export default app;
