import { SKUService } from '../../../services/SKUService';
import { Model } from 'mongoose';
import { IProduct, IProductVariant, ICategory } from '../../../models';
import AppError from '../../../utils/errors/AppError';

// Mock dependencies
jest.mock('../../../models', () => ({
  Product: {
    findById: jest.fn(),
  },
  ProductVariant: {
    find: jest.fn(),
  },
  Category: {
    findById: jest.fn(),
  },
}));

describe('SKUService', () => {
  let skuService: SKUService;
  let mockProduct: Model<IProduct>;
  let mockProductVariant: Model<IProductVariant>;
  let mockCategory: Model<ICategory>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create service instance with mocked dependencies
    skuService = new SKUService(
      mockProduct as any,
      mockProductVariant as any,
      mockCategory as any
    );
  });

  describe('generateSKU', () => {
    it('should generate a valid SKU format', async () => {
      const productId = '507f1f77bcf86cd799439011';
      const variantAttributes = { color: 'Black', size: 'Large' };

      // Mock product
      (mockProduct.findById as jest.Mock).mockResolvedValue({
        _id: productId,
        name: 'Test Product',
        category: {
          _id: '507f1f77bcf86cd799439012',
          name: 'Dresses',
        },
      });

      // Mock variants (empty for first SKU)
      (mockProductVariant.find as jest.Mock).mockResolvedValue([]);

      const sku = await skuService.generateSKU(productId, variantAttributes);

      // Verify SKU format: BRD-CAT-STY-CLR-SIZ-000001
      expect(sku).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}-\d{6}$/);
      expect(sku.split('-')).toHaveLength(6);
    });

    it('should increment sequence for multiple variants', async () => {
      const productId = '507f1f77bcf86cd799439011';
      const variantAttributes = { color: 'Red', size: 'Medium' };

      // Mock product
      (mockProduct.findById as jest.Mock).mockResolvedValue({
        _id: productId,
        name: 'Test Product',
        category: { name: 'Dresses' },
      });

      // Mock existing variant with SKU
      (mockProductVariant.find as jest.Mock).mockResolvedValue([
        { sku: 'TST-DRS-TST-BLK-LRG-000001' },
      ]);

      const sku = await skuService.generateSKU(productId, variantAttributes);

      // Should increment sequence
      expect(sku).toContain('-000002');
    });

    it('should throw error if product not found', async () => {
      const productId = '507f1f77bcf86cd799439011';
      const variantAttributes = { color: 'Blue', size: 'Small' };

      (mockProduct.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        skuService.generateSKU(productId, variantAttributes)
      ).rejects.toThrow(AppError);
    });
  });

  describe('parseSKU', () => {
    it('should parse a valid SKU', () => {
      const sku = 'BRD-CAT-STY-CLR-SIZ-000123';
      const parsed = skuService.parseSKU(sku);

      expect(parsed).toEqual({
        brandCode: 'BRD',
        categoryCode: 'CAT',
        styleCode: 'STY',
        colorCode: 'CLR',
        sizeCode: 'SIZ',
        seq: '000123',
      });
    });

    it('should throw error for invalid SKU format', () => {
      const invalidSku = 'INVALID-SKU';

      expect(() => skuService.parseSKU(invalidSku)).toThrow(AppError);
    });
  });
});

