import { Request, Response, NextFunction } from 'express';
import AppError from './AppError';
import logger from '../logger';

const { NODE_ENV } = process.env;
const DEVELOPMENT = 'development';

const errorMiddleWare = async (error: AppError, req: Request, res: Response, next: NextFunction): Promise<void> => {
  const body: any = {};
  body.status = 'error';
  body.message = error.message;

  if (NODE_ENV === DEVELOPMENT) {
    body.error = error.stack;
  }

  // if status code is not set, set it to 500
  if (!error.statusCode) {
    error.statusCode = 500;
  }

  if (NODE_ENV !== DEVELOPMENT && error.statusCode >= 500) {
    body.message = 'Something went very wrong';
  }
  logger.error(error.message);
  res.status(error.statusCode).json(body);
  return;
};

export default errorMiddleWare;
