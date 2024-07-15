import mongoose from 'mongoose';
// import logger from '../utils/logger';

import { env } from '../config';
import logger from '../utils/logger';

const { MONGO_URL } = env;

//Connection to mongoDb Database
const connectToDB = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGO_URL as string);
    logger.info('Database connected successfully!');
  } catch (err) {
    logger.error(err);
  }
};

export default connectToDB;
//
