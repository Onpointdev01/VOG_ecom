import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IProduct } from '../models/Product';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';

export interface IProductService {
  createProduct(payload: Partial<IProduct>): Promise<IProduct>;
  getProductById(id: string): Promise<IProduct>;
  getAllProducts(): Promise<IProduct[]>;
  updateProduct(id: string, payload: Partial<IProduct>): Promise<IProduct>;
  deleteProduct(id: string): Promise<void>;
}

@injectable()
export class ProductService extends BaseService implements IProductService {
  constructor(@inject(TYPES.Product) private Product: Model<IProduct>) {
    super();
  }

  async createProduct(payload: Partial<IProduct>): Promise<IProduct> {
    const { name } = payload;
    // Check if product exists by name or another unique identifier
    const existingProduct = await this.Product.findOne({ name });
    if (existingProduct) throw new AppError('Product already exists', 400);

    const newProduct = await this.Product.create(payload);
    return newProduct;
  }

  async getProductById(id: string): Promise<IProduct> {
    const product = await this.Product.findById(id);
    if (!product) throw new AppError('Product not found', 404);
    return product;
  }

  async getAllProducts(): Promise<IProduct[]> {
    return this.Product.find();
  }

  async updateProduct(id: string, payload: Partial<IProduct>): Promise<IProduct> {
    const updatedProduct = await this.Product.findByIdAndUpdate(id, payload, { new: true });
    if (!updatedProduct) throw new AppError('Product not found', 404);
    return updatedProduct;
  }

  async deleteProduct(id: string): Promise<void> {
    const result = await this.Product.findByIdAndDelete(id);
    if (!result) throw new AppError('Product not found', 404);
  }
}
