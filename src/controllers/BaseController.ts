/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { controller, httpGet, httpPost, response, request } from 'inversify-express-utils';
import { successResponse } from '../utils/helpers/response';
import AppError from '../utils/errors/AppError';
import upload from '../utils/aws';

@controller('')
export class BaseController {
  sendResponse(@response() res: Response, status: number, mesage: string, data?: any) {
    return successResponse(res, status, mesage, data);
  }

  @httpGet('/')
  async index(req: Request, res: Response) {
    return this.sendResponse(res, 200, 'Welcome to the API');
  }

  //sample way to return error
  @httpGet('/error')
  async error() {
    throw new AppError('This is an error', 500);
  }

  // Add health check endpoint
  @httpGet('/health')
  async healthCheck(req: Request, res: Response) {
    const healthCheck = {
      uptime: process.uptime(),
      message: 'OK',
      timestamp: new Date().toLocaleString(),
    };

    try {
      // Perform checks, e.g., database connection, external services, etc.
      // Example: await db.authenticate();
      // healthCheck.db = 'Database connection is OK';

      return this.sendResponse(res, 200, 'Health check passed', healthCheck);
    } catch (error) {
      //   healthCheck.message = error.message;
      return this.sendResponse(res, 503, 'Health check failed', healthCheck);
    }
  }

  @httpPost('/api/v1/upload-single-file', upload.fields([{ name: 'image', maxCount: 1 }]))
  async uploadSingleFile(@request() req: Request, @response() res: Response) {
    try {
      if (!req.files) {
        throw new AppError('No file uploaded.', 400);
      }
      const files = req.files as { [key: string]: Express.MulterS3.File[] };
      const fileUrl = files.image[0].location;
      return this.sendResponse(res, 200, 'File uploaded successfully', { fileUrl });
    } catch (error) {
      console.log(error);
      throw new AppError('file uploaded not successful', 500);
    }
  }

  @httpPost('/api/v1/upload-multiple-files', upload.array('images', 10))
  async uploadMultipleFiles(@request() req: Request, @response() res: Response) {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        throw new AppError('No files uploaded.', 400);
      }
      
      const files = req.files as Express.MulterS3.File[];
      const imageUrls = files.map(file => file.location);

      return this.sendResponse(res, 200, 'Files uploaded successfully', imageUrls);
    } catch (error) {
      console.log(error);
      throw new AppError('Files upload not successful', 500);
    }
  }

  @httpPost('/api/v1/upload-product-images', upload.array('images', 20))
  async uploadProductImages(@request() req: Request, @response() res: Response) {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        throw new AppError('No images uploaded.', 400);
      }

      const { productName } = req.body;
      const files = req.files as Express.MulterS3.File[];
      
      // Group images by product if productName is provided
      const imageUrls = files.map(file => file.location);
      
      return this.sendResponse(res, 200, 'Product images uploaded successfully', { 
        productName: productName || 'bulk-upload',
        imageCount: imageUrls.length,
        imageUrls: imageUrls
      });
    } catch (error) {
      console.log(error);
      throw new AppError('Product images upload failed', 500);
    }
  }
}
