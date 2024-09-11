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
  addSubcategory(categoryId: string, subcategory: string): Promise<ICategory>;
  updateSubcategory(categoryId: string, oldSubcategory: string, newSubcategory: string): Promise<ICategory>;
  deleteSubcategory(categoryId: string, subcategory: string): Promise<ICategory>;
  getAllSubcategories(categoryId: string): Promise<string[]>;
  getSubcategoryByName(categoryId: string, subcategoryName: string): Promise<string>;
}

@injectable()
export class CategoryService extends BaseService implements ICategoryService {
  constructor(@inject(TYPES.Category) private Category: Model<ICategory>) {
    super();
  }

  async createCategory(payload: Partial<ICategory>): Promise<ICategory> {
    const { name } = payload;
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

  async addSubcategory(categoryId: string, subcategory: string): Promise<ICategory> {
    const category = await this.Category.findById(categoryId);
    if (!category) throw new AppError('Category not found', 404);
    
    if (category.subcategories.includes(subcategory)) throw new AppError('Subcategory already exists', 400);

    category.subcategories.push(subcategory);
    return category.save();
  }

  async updateSubcategory(categoryId: string, oldSubcategory: string, newSubcategory: string): Promise<ICategory> {
    const category = await this.Category.findById(categoryId);
    if (!category) throw new AppError('Category not found', 404);

    const index = category.subcategories.indexOf(oldSubcategory);
    if (index === -1) throw new AppError('Subcategory not found', 404);

    category.subcategories[index] = newSubcategory;
    return category.save();
  }

  async deleteSubcategory(categoryId: string, subcategory: string): Promise<ICategory> {
    const category = await this.Category.findById(categoryId);
    if (!category) throw new AppError('Category not found', 404);

    category.subcategories = category.subcategories.filter(sc => sc !== subcategory);
    return category.save();
  }

  async getAllSubcategories(categoryId: string): Promise<string[]> {
    const category = await this.Category.findById(categoryId);
    if (!category) throw new AppError('Category not found', 404);
    return category.subcategories;
  }

  async getSubcategoryByName(categoryId: string, subcategoryName: string): Promise<string> {
    const category = await this.Category.findById(categoryId);
    if (!category) throw new AppError('Category not found', 404);

    const subcategory = category.subcategories.find(sc => sc === subcategoryName);
    if (!subcategory) throw new AppError('Subcategory not found', 404);

    return subcategory;
  }
}
