import mongoose from 'mongoose';
// import logger from '../utils/logger';

import { env } from '../config';

const { MONGO_URL } = env;

//Connection to mongoDb Database
const connectToDB = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGO_URL as string);
    console.info('Database connected successfully!');
  } catch (err) {
    console.error(err);
  }
};

export default connectToDB;
//
