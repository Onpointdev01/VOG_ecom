import { inject } from 'inversify';
import { controller, httpGet, requestParam, response } from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import { IAdminService } from '../services/AdminService';
import { IAttributeService } from '../services/AttributeService';
import { IAttributeValueService } from '../services/AttributeValueService';
import { BaseController } from './BaseController';

/**
 * Read-only catalog data for sellers (taxonomy is managed by admin).
 */
@controller('/api/v1/seller')
export class SellerCatalogController extends BaseController {
  constructor(
    @inject(TYPES.AdminService) private adminService: IAdminService,
    @inject(TYPES.AttributeService) private attributeService: IAttributeService,
    @inject(TYPES.AttributeValueService) private attributeValueService: IAttributeValueService
  ) {
    super();
  }

  @httpGet('/categories', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getCategories(@response() res: Response) {
    const categories = await this.adminService.getAllCategories();
    return this.sendResponse(res, 200, 'Categories retrieved successfully', categories);
  }

  @httpGet('/brands', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getBrands(@response() res: Response) {
    const brands = await this.adminService.getAllBrands();
    return this.sendResponse(res, 200, 'Brands retrieved successfully', brands);
  }

  @httpGet('/attributes', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getAttributes(@response() res: Response) {
    const attributes = await this.attributeService.getAllAttributes();
    return this.sendResponse(res, 200, 'Attributes fetched successfully', attributes);
  }

  @httpGet('/attributes/active', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getActiveAttributes(@response() res: Response) {
    const attributes = await this.attributeService.getActiveAttributes();
    return this.sendResponse(res, 200, 'Active attributes fetched successfully', attributes);
  }

  @httpGet('/attributes/:id', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getAttributeById(@response() res: Response, @requestParam('id') id: string) {
    const attribute = await this.attributeService.getAttributeById(id);
    return this.sendResponse(res, 200, 'Attribute fetched successfully', attribute);
  }

  @httpGet('/attribute-values/attribute/:attributeId', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getAttributeValues(
    @response() res: Response,
    @requestParam('attributeId') attributeId: string
  ) {
    const values = await this.attributeValueService.getAttributeValues(attributeId);
    return this.sendResponse(res, 200, 'Attribute values fetched successfully', values);
  }
}
