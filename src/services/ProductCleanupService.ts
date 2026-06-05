import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IProduct, ISeller } from '../models';
import {
  deriveAvailabilityStatus,
  getTotalStock,
  isVariableProductType,
  ProductAvailabilityStatus,
} from '../utils/productAvailability';
import { IProductVariant } from '../models';

export interface ProductCleanupReport {
  dryRun: boolean;
  scanned: number;
  markedInvalid: number;
  markedOutOfStock: number;
  markedHidden: number;
  markedActive: number;
  orphanOwnerIds: string[];
  errors: string[];
}

/**
 * Non-destructive maintenance: sync availabilityStatus and flag orphan products.
 * Does not hard-delete documents unless `allowHardDelete` is explicitly true (default false).
 */
@injectable()
export class ProductCleanupService {
  constructor(
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.Seller) private Seller: Model<ISeller>,
    @inject(TYPES.ProductVariant) private ProductVariant: Model<IProductVariant>
  ) {}

  async runCleanup(options: {
    dryRun?: boolean;
    allowHardDelete?: boolean;
  } = {}): Promise<ProductCleanupReport> {
    const dryRun = options.dryRun !== false;
    const allowHardDelete = options.allowHardDelete === true;

    const report: ProductCleanupReport = {
      dryRun,
      scanned: 0,
      markedInvalid: 0,
      markedOutOfStock: 0,
      markedHidden: 0,
      markedActive: 0,
      orphanOwnerIds: [],
      errors: [],
    };

    const sellers = await this.Seller.find().select('_id status').lean();
    const sellerMap = new Map(
      sellers.map((s) => [String(s._id), s])
    );

    const products = await this.Product.find({ deletedAt: null }).lean();
    report.scanned = products.length;

    for (const product of products) {
      try {
        const ownerId = product.owner ? String(product.owner) : '';
        const seller = ownerId ? sellerMap.get(ownerId) : undefined;

        if (!seller) {
          report.orphanOwnerIds.push(ownerId || '(missing owner)');
          if (!dryRun) {
            if (allowHardDelete) {
              await this.Product.deleteOne({ _id: product._id });
            } else {
              await this.Product.updateOne(
                { _id: product._id },
                {
                  availabilityStatus: 'INVALID' satisfies ProductAvailabilityStatus,
                  isActive: false,
                }
              );
            }
          }
          report.markedInvalid += 1;
          continue;
        }

        let variants: Array<{ quantityAvailable?: number; isActive?: boolean }> = [];
        if (isVariableProductType(product.productType)) {
          variants = await this.ProductVariant.find({
            product: product._id,
            isActive: { $ne: false },
          })
            .select('quantityAvailable isActive')
            .lean();
        }

        const status = deriveAvailabilityStatus({
          product: {
            productType: product.productType,
            isActive: product.isActive,
            deletedAt: product.deletedAt,
            availabilityStatus: product.availabilityStatus,
            quantityAvailable: product.quantityAvailable,
            owner: product.owner,
            variants,
          },
          seller,
        });

        if (!dryRun) {
          await this.Product.updateOne(
            { _id: product._id },
            { availabilityStatus: status }
          );
        }

        if (status === 'ACTIVE') report.markedActive += 1;
        else if (status === 'OUT_OF_STOCK') report.markedOutOfStock += 1;
        else if (status === 'HIDDEN') report.markedHidden += 1;
        else if (status === 'INVALID') report.markedInvalid += 1;
      } catch (err) {
        report.errors.push(
          `${product._id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return report;
  }
}
