import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IProduct, IProductVariant, ISeller } from '../models';
import AppError from '../utils/errors/AppError';
import {
  ProductAvailabilityContext,
  assertOfferable,
  assertPurchasable,
  enrichProductAvailability,
  canViewProductPage,
} from '../utils/productAvailability';

@injectable()
export class ProductAvailabilityService {
  constructor(
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.ProductVariant) private ProductVariant: Model<IProductVariant>,
    @inject(TYPES.Seller) private Seller: Model<ISeller>
  ) {}

  async resolveContext(productId: string): Promise<ProductAvailabilityContext> {
    const product = await this.Product.findById(productId).lean();
    if (!product) {
      throw new AppError('Product not found', 404);
    }

    const seller = product.owner
      ? await this.Seller.findById(product.owner).lean()
      : null;

    let variants: IProductVariant[] = [];
    const { isVariableProductType } = await import('../utils/productAvailability');
    if (isVariableProductType(product.productType)) {
      variants = await this.ProductVariant.find({
        product: productId,
        isActive: { $ne: false },
      }).lean();
    }

    return {
      product: { ...product, variants },
      seller,
    };
  }

  async assertPurchasable(productId: string, quantity = 1): Promise<ProductAvailabilityContext> {
    const ctx = await this.resolveContext(productId);
    assertPurchasable(ctx, quantity);
    return ctx;
  }

  async assertOfferable(productId: string): Promise<ProductAvailabilityContext> {
    const ctx = await this.resolveContext(productId);
    assertOfferable(ctx);
    return ctx;
  }

  async getPublicProductView(productId: string) {
    const ctx = await this.resolveContext(productId);
    if (!canViewProductPage(ctx)) {
      throw new AppError('Product not found', 404);
    }
    return enrichProductAvailability(ctx.product, ctx.seller);
  }
}
