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
      // Check for multer errors first (they might be in req.file or req.files)
      if ((req as any).fileError) {
        console.error('Multer error:', (req as any).fileError);
        throw new AppError((req as any).fileError.message || 'File upload error', 400);
      }
      
      if (!req.files) {
        throw new AppError('No file uploaded.', 400);
      }
      
      const files = req.files as { [key: string]: Express.MulterS3.File[] };
      
      // Check if image field exists and has files
      if (!files.image || !Array.isArray(files.image) || files.image.length === 0) {
        console.error('Upload error: No image file found in request. Files received:', Object.keys(files));
        throw new AppError('No image file found in upload request.', 400);
      }
      
      const uploadedFile = files.image[0];
      
      // Check if file has location (S3 URL)
      if (!uploadedFile.location) {
        console.error('Upload error: File uploaded but no location (S3 URL) returned. File:', uploadedFile);
        throw new AppError('File uploaded but failed to get S3 URL.', 500);
      }
      
      const fileUrl = uploadedFile.location;
      return this.sendResponse(res, 200, 'File uploaded successfully', { fileUrl });
    } catch (error: any) {
      console.error('Upload error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        code: error?.code,
        files: req.files ? Object.keys(req.files as object) : 'no files',
        body: req.body,
      });
      
      // If it's already an AppError, re-throw it
      if (error instanceof AppError) {
        throw error;
      }
      
      // Handle multer errors specifically
      if (error?.code === 'LIMIT_FILE_SIZE' || error?.message?.includes('File too large')) {
        throw new AppError('File size exceeds the maximum allowed size (250MB)', 400);
      }
      
      if (error?.message?.includes('Invalid file type')) {
        throw new AppError('Invalid file type. Only JPEG, PNG, JPG, GIF, and WebP images are allowed', 400);
      }
      
      // Otherwise, wrap it in an AppError
      throw new AppError(error?.message || 'File upload not successful', 500);
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
