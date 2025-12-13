import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import AppError from '../utils/errors/AppError';
import logger from '../utils/logger';

/**
 * Middleware to handle Multer errors
 * Multer errors need to be caught before they reach the controller
 */
export const multerErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Check if it's a Multer error
  if (error instanceof MulterError) {
    logger.error('Multer error:', {
      code: error.code,
      field: error.field,
      message: error.message,
    });

    let message = 'File upload error';
    let statusCode = 400;

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File size exceeds the maximum allowed size (250MB)';
        statusCode = 400;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded';
        statusCode = 400;
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = `Unexpected file field: ${error.field}`;
        statusCode = 400;
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Too many parts in the request';
        statusCode = 400;
        break;
      default:
        message = error.message || 'File upload error';
        statusCode = 400;
    }

    return res.status(statusCode).json({
      status: 'error',
      message,
      code: error.code,
    });
  }

  // Check if it's a generic file upload error
  if (error.message && (
    error.message.includes('Invalid file type') ||
    error.message.includes('file type') ||
    error.message.includes('upload')
  )) {
    logger.error('File upload error:', error.message);
    return res.status(400).json({
      status: 'error',
      message: error.message || 'File upload error',
    });
  }

  // If it's not a multer error, pass it to the next error handler
  next(error);
};

export default multerErrorHandler;

