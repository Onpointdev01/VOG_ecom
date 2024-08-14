import { inject } from 'inversify';
import { controller, httpPost, httpGet, httpPut, httpDelete, requestParam, requestBody, response } from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { ICategoryService } from '../services';
import { ICategory } from '../models';


@controller('/api/v1/categories')
export class CategoryController extends BaseController {
  constructor(@inject(TYPES.CategoryService) private categoryService: ICategoryService) {
    super();
  }

  @httpPost('/')
  async createCategory(@response() res: Response, @requestBody() payload: Partial<ICategory>) {
    const newCategory = await this.categoryService.createCategory(payload);
    return this.sendResponse(res, 201, 'Category created successfully', newCategory);
  }

  @httpGet('/:id')
  async getCategoryById(@response() res: Response, @requestParam('id') id: string) {
    const category = await this.categoryService.getCategoryById(id);
    return this.sendResponse(res, 200, 'Category retrieved successfully', category);
  }

  @httpGet('/')
  async getAllCategories(@response() res: Response) {
    const categories = await this.categoryService.getAllCategories();
    return this.sendResponse(res, 200, 'Categories retrieved successfully', categories);
  }

  @httpPut('/:id')
  async updateCategory(@response() res: Response, @requestParam('id') id: string, @requestBody() payload: Partial<ICategory>) {
    const updatedCategory = await this.categoryService.updateCategory(id, payload);
    return this.sendResponse(res, 200, 'Category updated successfully', updatedCategory);
  }

  @httpDelete('/:id')
  async deleteCategory(@response() res: Response, @requestParam('id') id: string) {
    await this.categoryService.deleteCategory(id);
    return this.sendResponse(res, 204, 'Category deleted successfully');
  }
}
