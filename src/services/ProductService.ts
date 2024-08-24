import { inject, injectable } from 'inversify';
import TYPES from '../di';
import { BaseService } from './BaseService';
import { IProduct } from '../models';
import { Model } from 'mongoose';

export interface IProductService {
  getAllProducts(): Promise<IProduct[]>;
}

@injectable()
export class ProductService extends BaseService implements IProductService {
  constructor(@inject(TYPES.Product) private Product: Model<IProduct>) {
    super();
  }

  async getAllProducts() {
    return await this.Product.find();
  }
}
