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
  createSubcategory(parentId: string, payload: Partial<ICategory>): Promise<ICategory>;
  updateSubcategory(subcategoryId: string, payload: Partial<ICategory>): Promise<ICategory>;
  deleteSubcategory(subcategoryId: string): Promise<void>;
  getAllSubcategories(categoryId: string): Promise<ICategory[]>;
  getSubcategoryByName(categoryId: string, subcategoryName: string): Promise<ICategory>;
}

@injectable()
export class CategoryService extends BaseService implements ICategoryService {
  constructor(@inject(TYPES.Category) private Category: Model<ICategory>) {
    super();
  }

  async createCategory(payload: Partial<ICategory>): Promise<ICategory> {
    const existingCategory = await this.Category.findOne({ name: payload.name });
    if (existingCategory) throw new AppError('Category already exists', 400);
    return this.Category.create(payload);
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
    // Supprimer les champs undefined pour ne pas réinitialiser par défaut
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    const updatedCategory = await this.Category.findByIdAndUpdate(id, payload, { new: true });
    if (!updatedCategory) throw new AppError('Category not found', 404);
    return updatedCategory;
  }

  async deleteCategory(id: string): Promise<void> {
    const result = await this.Category.findByIdAndDelete(id);
    if (!result) throw new AppError('Category not found', 404);
  }

  async createSubcategory(parentId: string, payload: Partial<ICategory>): Promise<ICategory> {
    const parentCategory = await this.Category.findById(parentId);
    if (!parentCategory) throw new AppError('Parent category not found', 404);

    const existingSub = await this.Category.findOne({ name: payload.name, parent: parentId });
    if (existingSub) throw new AppError('Subcategory already exists under this parent', 400);

    return this.Category.create({ ...payload, parent: parentId });
  }

  async updateSubcategory(subcategoryId: string, payload: Partial<ICategory>): Promise<ICategory> {
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    const updatedSub = await this.Category.findByIdAndUpdate(subcategoryId, payload, { new: true });
    if (!updatedSub) throw new AppError('Subcategory not found', 404);
    return updatedSub;
  }

  async deleteSubcategory(subcategoryId: string): Promise<void> {
    const result = await this.Category.findByIdAndDelete(subcategoryId);
    if (!result) throw new AppError('Subcategory not found', 404);
  }

  async getAllSubcategories(categoryId: string): Promise<ICategory[]> {
    return this.Category.find({ parent: categoryId });
  }

  async getSubcategoryByName(categoryId: string, subcategoryName: string): Promise<ICategory> {
    const sub = await this.Category.findOne({ name: subcategoryName, parent: categoryId });
    if (!sub) throw new AppError('Subcategory not found', 404);
    return sub;
  }
}
