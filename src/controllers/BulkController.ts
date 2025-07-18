import { Request, Response } from 'express';
import { controller, httpPost, request, response } from 'inversify-express-utils';
import { inject } from 'inversify';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import TYPES from '../di';
import { ProductService } from '../services/ProductService';
import { successResponse } from '../utils/helpers/response';
import AppError from '../utils/errors/AppError';
import upload from '../utils/aws';

interface CSVProductRow {
  name: string;
  description: string;
  productType: 'simple' | 'variable';
  category: string;
  brand: string;
  condition: 'Brand New' | 'Used' | 'Refurbished';
  price?: string;
  originalPrice?: string;
  color?: string;
  quantityAvailable?: string;
  images?: string;
}

@controller('/api/v1/bulk')
export class BulkController {
  constructor(@inject(TYPES.ProductService) private productService: ProductService) {}

  @httpPost('/products/csv', TYPES.RequireSignIn, TYPES.RequireSeller, upload.single('csv'))
  async uploadProductsCSV(@request() req: Request, @response() res: Response) {
    try {
      if (!req.file) {
        throw new AppError('No CSV file uploaded', 400);
      }

      const file = req.file as Express.MulterS3.File;
      
      // Validate file type
      if (!file.mimetype.includes('csv') && !file.originalname.endsWith('.csv')) {
        throw new AppError('Please upload a valid CSV file', 400);
      }

      const products: any[] = [];
      const errors: string[] = [];

      // Parse CSV from S3 URL
      const response = await fetch(file.location);
      const csvData = await response.text();
      
      return new Promise((resolve, reject) => {
        const stream = Readable.from(csvData);
        
        stream
          .pipe(csvParser())
          .on('data', (row: CSVProductRow) => {
            try {
              const product = this.validateAndTransformRow(row, products.length + 1);
              products.push(product);
            } catch (error: any) {
              errors.push(`Row ${products.length + 1}: ${error.message}`);
            }
          })
          .on('end', async () => {
            try {
              if (errors.length > 0 && products.length === 0) {
                throw new AppError(`CSV validation failed: ${errors.join(', ')}`, 400);
              }

              // Create products in batches
              const results = await this.createProductsBatch(products, req.user.id);
              
              resolve(successResponse(res, 201, 'Products uploaded successfully', {
                created: results.length,
                errors: errors,
                products: results
              }));
            } catch (error) {
              reject(error);
            }
          })
          .on('error', (error) => {
            reject(new AppError(`CSV parsing failed: ${error.message}`, 400));
          });
      });

    } catch (error) {
      throw error;
    }
  }

  @httpPost('/products/json', TYPES.RequireSignIn, TYPES.RequireSeller)
  async uploadProductsJSON(@request() req: Request, @response() res: Response) {
    try {
      const { products } = req.body;

      if (!Array.isArray(products) || products.length === 0) {
        throw new AppError('Products array is required and cannot be empty', 400);
      }

      const results = await this.createProductsBatch(products, req.user.id);

      return successResponse(res, 201, 'Products created successfully', {
        created: results.length,
        products: results
      });
    } catch (error) {
      throw error;
    }
  }

  @httpPost('/products/with-images', TYPES.RequireSignIn, TYPES.RequireSeller, upload.fields([
    { name: 'csv', maxCount: 1 },
    { name: 'images', maxCount: 50 }
  ]))
  async uploadProductsWithImages(@request() req: Request, @response() res: Response) {
    try {
      const files = req.files as { [fieldname: string]: Express.MulterS3.File[] };
      
      if (!files.csv || files.csv.length === 0) {
        throw new AppError('CSV file is required', 400);
      }

      if (!files.images || files.images.length === 0) {
        throw new AppError('At least one product image is required', 400);
      }

      // Create a mapping of image URLs by filename
      const imageMapping: { [key: string]: string } = {};
      files.images.forEach(file => {
        const cleanName = file.originalname.toLowerCase().replace(/[^a-z0-9.-]/g, '-');
        imageMapping[cleanName] = file.location;
        imageMapping[file.originalname] = file.location; // Also map original name
      });

      // Parse CSV and map images
      const csvFile = files.csv[0];
      const response = await fetch(csvFile.location);
      const csvData = await response.text();
      
      const products: any[] = [];
      const errors: string[] = [];

      return new Promise((resolve, reject) => {
        const stream = Readable.from(csvData);
        
        stream
          .pipe(csvParser())
          .on('data', (row: CSVProductRow & { imageFiles?: string }) => {
            try {
              const product = this.validateAndTransformRow(row, products.length + 1);
              
              // Map image files to URLs if specified
              if (row.imageFiles) {
                const imageFiles = row.imageFiles.split(',').map(f => f.trim());
                const mappedImages = imageFiles
                  .map(filename => imageMapping[filename] || imageMapping[filename.toLowerCase()])
                  .filter(url => url);
                
                if (mappedImages.length > 0) {
                  product.images = mappedImages;
                }
              }
              
              products.push(product);
            } catch (error: any) {
              errors.push(`Row ${products.length + 1}: ${error.message}`);
            }
          })
          .on('end', async () => {
            try {
              if (errors.length > 0 && products.length === 0) {
                throw new AppError(`CSV validation failed: ${errors.join(', ')}`, 400);
              }

              const results = await this.createProductsBatch(products, req.user.id);
              
              resolve(successResponse(res, 201, 'Products with images uploaded successfully', {
                created: results.length,
                imagesUploaded: files.images.length,
                errors: errors,
                imageMapping: Object.keys(imageMapping),
                products: results
              }));
            } catch (error) {
              reject(error);
            }
          })
          .on('error', (error) => {
            reject(new AppError(`CSV parsing failed: ${error.message}`, 400));
          });
      });

    } catch (error) {
      throw error;
    }
  }

  private validateAndTransformRow(row: CSVProductRow, rowNumber: number): any {
    const errors: string[] = [];

    // Required fields validation
    if (!row.name?.trim()) errors.push('Name is required');
    if (!row.description?.trim()) errors.push('Description is required');
    if (!row.productType || !['simple', 'variable'].includes(row.productType)) {
      errors.push('Product type must be "simple" or "variable"');
    }
    if (!row.category?.trim()) errors.push('Category ID is required');
    if (!row.brand?.trim()) errors.push('Brand is required');
    if (!row.condition || !['Brand New', 'Used', 'Refurbished'].includes(row.condition)) {
      errors.push('Condition must be "Brand New", "Used", or "Refurbished"');
    }

    // Simple product specific validation
    if (row.productType === 'simple') {
      if (!row.price || isNaN(parseFloat(row.price))) {
        errors.push('Valid price is required for simple products');
      }
      if (!row.quantityAvailable || isNaN(parseInt(row.quantityAvailable))) {
        errors.push('Valid quantity is required for simple products');
      }
      if (!row.images?.trim()) {
        errors.push('At least one image URL is required');
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    // Transform the row
    const product: any = {
      name: row.name.trim(),
      description: row.description.trim(),
      productType: row.productType,
      category: row.category.trim(),
      brand: row.brand.trim(),
      condition: row.condition,
    };

    // Add simple product fields
    if (row.productType === 'simple') {
      product.price = parseFloat(row.price!);
      product.quantityAvailable = parseInt(row.quantityAvailable!);
      product.images = row.images!.split(',').map(url => url.trim()).filter(url => url);
      
      if (row.originalPrice && !isNaN(parseFloat(row.originalPrice))) {
        product.originalPrice = parseFloat(row.originalPrice);
      }
      if (row.color?.trim()) {
        product.color = row.color.trim();
      }
    }

    return product;
  }

  private async createProductsBatch(products: any[], sellerId: string): Promise<any[]> {
    const results = [];
    const batchSize = 10; // Process in smaller batches to avoid overwhelming the DB

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      
      for (const productData of batch) {
        try {
          productData.owner = sellerId;
          const product = await this.productService.createProduct(productData);
          results.push(product);
        } catch (error: any) {
          console.error(`Failed to create product ${productData.name}:`, error.message);
          // Continue with other products even if one fails
        }
      }
    }

    return results;
  }
}