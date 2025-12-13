import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IProduct, IProductVariant, ICategory } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';

export interface ISKUService {
  generateSKU(productId: string, variantAttributes: Record<string, string>): Promise<string>;
  parseSKU(sku: string): {
    brandCode: string;
    categoryCode: string;
    styleCode: string;
    colorCode: string;
    sizeCode: string;
    seq: string;
  };
}

/**
 * SKU Generator Service
 * Generates Shein-like SKUs: {brandCode}-{categoryCode}-{styleCode}-{colorCode}-{sizeCode}-{seq}
 * Example: SHN-DRS-OVR-BLK-S-000123
 */
@injectable()
export class SKUService extends BaseService implements ISKUService {
  constructor(
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.ProductVariant) private ProductVariant: Model<IProductVariant>,
    @inject(TYPES.Category) private Category: Model<ICategory>
  ) {
    super();
  }

  /**
   * Generate a Shein-like SKU for a product variant
   * Format: {brandCode}-{categoryCode}-{styleCode}-{colorCode}-{sizeCode}-{seq}
   */
  async generateSKU(productId: string, variantAttributes: Record<string, string>): Promise<string> {
    try {
      // Fetch product with category
      const product = await this.Product.findById(productId).populate('category');
      if (!product) {
        throw new AppError('Product not found', 404);
      }

      // Extract brand code (from product name or brand field, default to first 3 chars)
      const brandCode = this.extractCode(product.name || 'PRD', 3, 'BRD');

      // Extract category code (from category name, default to 'CAT')
      let categoryCode = 'CAT';
      if (product.category && typeof product.category === 'object' && 'name' in product.category) {
        categoryCode = this.extractCode((product.category as any).name as string, 3, 'CAT');
      } else if (typeof product.category === 'string') {
        const category = await this.Category.findById(product.category);
        if (category && 'name' in category) {
          categoryCode = this.extractCode((category as any).name as string, 3, 'CAT');
        }
      }

      // Extract style code (from product name, use middle 3 chars)
      const styleCode = this.extractCode(product.name || 'STY', 3, 'STY', 3);

      // Extract color code (from variant attributes)
      const colorCode = this.extractCode(variantAttributes.color || variantAttributes.Color || 'CLR', 3, 'CLR');

      // Extract size code (from variant attributes)
      const sizeCode = this.extractCode(variantAttributes.size || variantAttributes.Size || 'SIZ', 3, 'SIZ');

      // Generate sequence number (incrementing from existing variants)
      const seq = await this.generateSequence(productId, brandCode, categoryCode, styleCode);

      // Format: BRD-CAT-STY-CLR-SIZ-000123
      return `${brandCode}-${categoryCode}-${styleCode}-${colorCode}-${sizeCode}-${seq}`.toUpperCase();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to generate SKU', 500);
    }
  }

  /**
   * Parse a SKU string into its components
   */
  parseSKU(sku: string): {
    brandCode: string;
    categoryCode: string;
    styleCode: string;
    colorCode: string;
    sizeCode: string;
    seq: string;
  } {
    const parts = sku.split('-');
    if (parts.length !== 6) {
      throw new AppError('Invalid SKU format', 400);
    }

    return {
      brandCode: parts[0],
      categoryCode: parts[1],
      styleCode: parts[2],
      colorCode: parts[3],
      sizeCode: parts[4],
      seq: parts[5],
    };
  }

  /**
   * Extract a code from a string (alphanumeric, uppercase)
   */
  private extractCode(
    text: string,
    length: number = 3,
    fallback: string = 'XXX',
    startIndex: number = 0
  ): string {
    if (!text) return fallback;

    // Remove special characters, keep alphanumeric
    const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (cleaned.length === 0) return fallback;

    // Extract substring
    const extracted = cleaned.substring(startIndex, startIndex + length);

    // Pad if needed
    return extracted.padEnd(length, 'X').substring(0, length);
  }

  /**
   * Generate a 6-digit sequence number for the SKU
   * Finds the highest existing sequence for similar SKU pattern and increments
   */
  private async generateSequence(
    productId: string,
    brandCode: string,
    categoryCode: string,
    styleCode: string
  ): Promise<string> {
    try {
      // Find all variants for this product
      const variants = await this.ProductVariant.find({ product: productId }).select('sku');

      // Extract existing sequences
      const sequences: number[] = [];
      const pattern = new RegExp(
        `^${brandCode}-${categoryCode}-${styleCode}-[A-Z0-9]{3}-[A-Z0-9]{3}-(\\d{6})$`
      );

      variants.forEach((variant) => {
        if (variant.sku) {
          const match = variant.sku.match(pattern);
          if (match && match[1]) {
            const seq = parseInt(match[1], 10);
            if (!isNaN(seq)) {
              sequences.push(seq);
            }
          }
        }
      });

      // Get the next sequence number
      const maxSeq = sequences.length > 0 ? Math.max(...sequences) : 0;
      const nextSeq = maxSeq + 1;

      // Format as 6-digit string with leading zeros
      return nextSeq.toString().padStart(6, '0');
    } catch (error) {
      // On error, use timestamp-based sequence
      const timestamp = Date.now().toString().slice(-6);
      return timestamp;
    }
  }
}

