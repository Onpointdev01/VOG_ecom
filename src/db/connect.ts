import mongoose from 'mongoose';
// import logger from '../utils/logger';

import { env } from '../config';
import logger from '../utils/logger';
import { Category } from '../models/newCategory';

const { MONGO_URL } = env;

//Connection to mongoDb Database
const connectToDB = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGO_URL as string, {
      serverSelectionTimeoutMS: 5000, // fail fast if DNS fails
    });
    logger.info('Database connected successfully!');
    
    // Fix category slug index after connection
    try {
      await Category.collection.dropIndex('slug_1');
      logger.info('Dropped old category slug index');
    } catch (error) {
      logger.info('Old index may not exist or already dropped');
    }
    
    // Mongoose will recreate indexes based on schema definition
    await Category.syncIndexes();
    logger.info('Category indexes synced');
    
  } catch (err) {
    logger.error(err);
  }
};

export default connectToDB;
//
