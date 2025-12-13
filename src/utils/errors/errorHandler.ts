import { Request, Response, NextFunction } from 'express';
import AppError from './AppError';
import logger from '../logger';

const { NODE_ENV } = process.env;
const DEVELOPMENT = 'development';

const errorMiddleWare = async (error: AppError, req: Request, res: Response, next: NextFunction): Promise<void> => {
  logger.error('An error occurred:', error);
  // Log full error context for debugging
  logger.error('Application Error Details:', {
    name: error.name,
    message: error.message,
    statusCode: error.statusCode,
    code: error.code,
    errors: error.errors,
    stack: error.stack,
    isOperational: error.isOperational,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    headers: req.headers,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });

  const body: any = {};
  body.status = 'error';
  body.message = error.message;

  // Include error code if available
  if (error.code) {
    body.code = error.code;
  }

  // Include detailed errors if available (validation errors, etc.)
  if (error.errors) {
    body.errors = error.errors;
  }

  if (NODE_ENV === DEVELOPMENT) {
    body.error = error.stack;
  }

  // if status code is not set, set it to 500
  if (!error.statusCode) {
    error.statusCode = 500;
  }

  // Always show error message in development
  // In production, only hide error details for non-operational 500+ errors
  if (NODE_ENV !== DEVELOPMENT && error.statusCode >= 500 && !error.isOperational) {
    body.message = 'Something went very wrong';
  } else {
    // In development or for operational errors, show the actual error message
    body.message = error.message || 'An error occurred';
  }

  res.status(error.statusCode).json(body);
  return;
};

export default errorMiddleWare;
