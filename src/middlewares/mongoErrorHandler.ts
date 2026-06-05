import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import logger from '../utils/logger';

interface StructuredError {
  status: string;
  message: string;
  errors?: any;
  code?: string;
}

export const mongoErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('MongoDB Error:', err);
  // Log full error context for debugging
  logger.error('MongoDB Error Details:', {
    name: err.name,
    message: err.message,
    code: err.code,
    stack: err.stack,
    errors: err.errors,
    keyPattern: err.keyPattern,
    keyValue: err.keyValue,
    path: err.path,
    value: err.value,
    kind: err.kind,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  let error: StructuredError = {
    status: 'error',
    message: 'Something went wrong',
  };

  // MongoDB Duplicate Key Error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    const value = err.keyValue[field];
    error = {
      status: 'error',
      message: `${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists`,
      code: 'DUPLICATE_KEY',
      errors: {
        [field]: `${field} must be unique`,
      },
    };
    return res.status(400).json(error);
  }

  // Mongoose Validation Error
  if (err instanceof MongooseError.ValidationError) {
    const errors: any = {};
    Object.keys(err.errors).forEach((key) => {
      const errorObj = err.errors[key] as any;
      if (errorObj.kind === 'required') {
        errors[key] = `${key} is required`;
      } else if (errorObj.kind === 'enum') {
        const enumValues = errorObj.properties?.enumValues || [];
        errors[key] = `${key} must be one of: ${enumValues.join(', ')}`;
      } else if (errorObj.kind === 'minlength') {
        const minLength = errorObj.properties?.minlength || 0;
        errors[key] = `${key} must be at least ${minLength} characters`;
      } else if (errorObj.kind === 'maxlength') {
        const maxLength = errorObj.properties?.maxlength || 0;
        errors[key] = `${key} cannot exceed ${maxLength} characters`;
      } else if (errorObj.kind === 'min') {
        const min = errorObj.properties?.min || 0;
        errors[key] = `${key} must be at least ${min}`;
      } else if (errorObj.kind === 'max') {
        const max = errorObj.properties?.max || 0;
        errors[key] = `${key} cannot exceed ${max}`;
      } else if (errorObj.name === 'CastError') {
        errors[key] = `${key} is not valid`;
      } else {
        errors[key] = errorObj.message || `${key} is invalid`;
      }
    });

    error = {
      status: 'error',
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors,
    };
    return res.status(400).json(error);
  }

  // Mongoose Cast Error (Invalid ObjectId, etc.)
  if (err instanceof MongooseError.CastError) {
    const field = err.path;
    error = {
      status: 'error',
      message: `Invalid ${field} format`,
      code: 'CAST_ERROR',
      errors: {
        [field]: `${field} is not valid`,
      },
    };
    return res.status(400).json(error);
  }

  // MongoDB Connection Error
  if (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
    error = {
      status: 'error',
      message: 'Database connection failed',
      code: 'DATABASE_CONNECTION_ERROR',
    };
    return res.status(503).json(error);
  }

  // MongoDB Timeout Error
  if (err.name === 'MongooseTimeoutError') {
    error = {
      status: 'error',
      message: 'Database operation timed out',
      code: 'DATABASE_TIMEOUT',
    };
    return res.status(504).json(error);
  }

  // Default to next middleware
  next(err);
};

export default mongoErrorHandler;
