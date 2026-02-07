import { inject } from 'inversify';
import {
  controller,
  httpPost,
  httpGet,
  httpPut,
  httpDelete,
  requestParam,
  requestBody,
  request,
  response,
} from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { ICategoryService, ITranslationService } from '../services';
import { ICategory } from '../models';
import { Request } from 'express';

@controller('/api/v1/categories')
export class CategoryController extends BaseController {
  constructor(
    @inject(TYPES.CategoryService) private categoryService: ICategoryService,
    @inject(TYPES.TranslationService) private translationService: ITranslationService
  ) {
    super();
  }

  /**
   * Get target language from Accept-Language header
   * Defaults to 'fr' if not specified
   */
  private getTargetLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (acceptLanguage) {
      const languages = acceptLanguage.split(',').map(lang => {
        const parts = lang.split(';');
        return parts[0].trim().toLowerCase().split('-')[0];
      });
      const lang = languages[0];
      return (lang === 'fr' || lang === 'en') ? lang : 'fr';
    }
    return 'fr';
  }

  /**
   * Translate category data
   */
  private async translateCategoryData(category: any, targetLanguage: string): Promise<any> {
    if (targetLanguage === 'fr') {
      return category;
    }

    try {
      const textsToTranslate: string[] = [];
      
      if (category.name) {
        textsToTranslate.push(category.name);
      }
      if (category.description) {
        textsToTranslate.push(category.description);
      }

      if (textsToTranslate.length > 0) {
        const translations = await this.translationService.translateBatch(textsToTranslate, targetLanguage, 'fr');
        
        let translationIndex = 0;
        if (category.name) {
          category.name = translations[translationIndex++];
        }
        if (category.description) {
          category.description = translations[translationIndex++];
        }
      }

      // Translate subcategories if they exist
      if (category.subcategories && Array.isArray(category.subcategories)) {
        category.subcategories = await Promise.all(
          category.subcategories.map((sub: any) => this.translateCategoryData(sub, targetLanguage))
        );
      }
    } catch (error) {
      console.error('Error translating category:', error);
    }

    return category;
  }

  /**
   * Translate array of categories
   */
  private async translateCategories(categories: any[], targetLanguage: string): Promise<any[]> {
    if (targetLanguage === 'fr') {
      return categories;
    }
    return Promise.all(categories.map(category => this.translateCategoryData(category, targetLanguage)));
  }

  @httpPost('/')
  async createCategory(@response() res: Response, @requestBody() payload: Partial<ICategory>) {
    const newCategory = await this.categoryService.createCategory(payload);
    return this.sendResponse(res, 201, 'Category created successfully', newCategory);
  }

  @httpGet('/:id')
  async getCategoryById(@request() req: Request, @response() res: Response, @requestParam('id') id: string) {
    const category = await this.categoryService.getCategoryById(id);
    
    // Translate category based on Accept-Language header
    const targetLanguage = this.getTargetLanguage(req);
    const translatedCategory = await this.translateCategoryData(category, targetLanguage);
    
    return this.sendResponse(res, 200, 'Category retrieved successfully', translatedCategory);
  }

  @httpGet('/')
  async getAllCategories(@request() req: Request, @response() res: Response) {
    const categories = await this.categoryService.getAllCategories();
    
    // Translate categories based on Accept-Language header
    const targetLanguage = this.getTargetLanguage(req);
    const translatedCategories = await this.translateCategories(categories, targetLanguage);
    
    return this.sendResponse(res, 200, 'Categories retrieved successfully', translatedCategories);
  }

  @httpPut('/:id')
  async updateCategory(
    @response() res: Response,
    @requestParam('id') id: string,
    @requestBody() payload: Partial<ICategory>
  ) {
    const updatedCategory = await this.categoryService.updateCategory(id, payload);
    return this.sendResponse(res, 200, 'Category updated successfully', updatedCategory);
  }

  @httpDelete('/:id')
  async deleteCategory(@response() res: Response, @requestParam('id') id: string) {
    await this.categoryService.deleteCategory(id);
    return this.sendResponse(res, 204, 'Category deleted successfully');
  }

  // Subcategory routes
  @httpPost('/:id/subcategories')
  async createSubcategory(
    @response() res: Response,
    @requestParam('id') parentId: string,
    @requestBody() payload: Partial<ICategory>
  ) {
    const newSubcategory = await this.categoryService.createSubcategory(parentId, payload);
    return this.sendResponse(res, 201, 'Subcategory created successfully', newSubcategory);
  }

  @httpPut('/:id/subcategories/:subId')
  async updateSubcategory(
    @response() res: Response,
    @requestParam('id') categoryId: string,
    @requestParam('subId') subcategoryId: string,
    @requestBody() payload: Partial<ICategory>
  ) {
    const updatedSub = await this.categoryService.updateSubcategory(subcategoryId, payload);
    return this.sendResponse(res, 200, 'Subcategory updated successfully', updatedSub);
  }

  @httpDelete('/:id/subcategories/:subId')
  async deleteSubcategory(
    @response() res: Response,
    @requestParam('id') categoryId: string,
    @requestParam('subId') subcategoryId: string
  ) {
    await this.categoryService.deleteSubcategory(subcategoryId);
    return this.sendResponse(res, 204, 'Subcategory deleted successfully');
  }

  @httpGet('/:id/subcategories')
  async getAllSubcategories(@response() res: Response, @requestParam('id') categoryId: string) {
    const subcategories = await this.categoryService.getAllSubcategories(categoryId);
    return this.sendResponse(res, 200, 'Subcategories retrieved successfully', subcategories);
  }

  @httpGet('/:id/subcategories/:name')
  async getSubcategoryByName(
    @response() res: Response,
    @requestParam('id') categoryId: string,
    @requestParam('name') subcategoryName: string
  ) {
    const sub = await this.categoryService.getSubcategoryByName(categoryId, subcategoryName);
    return this.sendResponse(res, 200, 'Subcategory retrieved successfully', sub);
  }
}
