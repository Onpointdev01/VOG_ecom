import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import { TYPES } from '../di';
import { ICategory } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';

export interface ICategoryService {
  createCategory(payload: Partial<ICategory>): Promise<ICategory>;
  getCategoryById(id: string): Promise<ICategory>;
  getAllCategories(): Promise<ICategory[]>;
  updateCategory(id: string, payload: Partial<ICategory>): Promise<ICategory>;
  deleteCategory(id: string): Promise<void>;
}

@injectable()
export class CategoryService extends BaseService implements ICategoryService {
  constructor(@inject(TYPES.Category) private Category: Model<ICategory>) {
    super();
  }

  async createCategory(payload: Partial<ICategory>): Promise<ICategory> {
    const { name } = payload;
    // Check if category exists
    const existingCategory = await this.Category.findOne({ name });
    if (existingCategory) throw new AppError('Category already exists', 400);

    const newCategory = await this.Category.create(payload);
    return newCategory;
  }

  async getCategoryById(id: string): Promise<ICategory> {
    const category = await this.Category.findById(id);
    if (!category) throw new AppError('Category not found', 404);
    return category;
  }

  async getAllCategories(): Promise<ICategory[]> {
    return this.Category.find();
  }

  async updateCategory(id: string, payload: Partial<ICategory>): Promise<ICategory> {
    const updatedCategory = await this.Category.findByIdAndUpdate(id, payload, { new: true });
    if (!updatedCategory) throw new AppError('Category not found', 404);
    return updatedCategory;
  }

  async deleteCategory(id: string): Promise<void> {
    const result = await this.Category.findByIdAndDelete(id);
    if (!result) throw new AppError('Category not found', 404);
  }
}
