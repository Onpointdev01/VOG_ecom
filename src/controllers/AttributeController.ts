import { inject } from 'inversify';
import {
  controller,
  httpDelete,
  httpGet,
  httpPost,
  httpPut,
  requestBody,
  requestParam,
  response,
} from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import {
  IAttributeService,
  CreateAttributeDTO,
  UpdateAttributeDTO,
} from '../services/AttributeService';
import { BaseController } from './BaseController';

@controller('/api/v1/admin/attributes', TYPES.RequireAdmin)
export class AttributeController extends BaseController {
  constructor(@inject(TYPES.AttributeService) private attributeService: IAttributeService) {
    super();
  }

  // Get all attributes (admin only)
  @httpGet('/')
  public async getAllAttributes(@response() res: Response) {
    const attributes = await this.attributeService.getAllAttributes();
    return this.sendResponse(res, 200, 'Attributes fetched successfully', attributes);
  }

  // Get active attributes (public - for category/product management)
  @httpGet('/active')
  public async getActiveAttributes(@response() res: Response) {
    const attributes = await this.attributeService.getActiveAttributes();
    return this.sendResponse(res, 200, 'Active attributes fetched successfully', attributes);
  }

  // Get single attribute by ID
  @httpGet('/:id')
  public async getAttributeById(@response() res: Response, @requestParam('id') id: string) {
    const attribute = await this.attributeService.getAttributeById(id);
    return this.sendResponse(res, 200, 'Attribute fetched successfully', attribute);
  }

  // Create new attribute
  @httpPost('/')
  public async createAttribute(
    @response() res: Response,
    @requestBody() payload: CreateAttributeDTO
  ) {
    const attribute = await this.attributeService.createAttribute(payload);
    return this.sendResponse(res, 201, 'Attribute created successfully', attribute);
  }

  // Update attribute
  @httpPut('/:id')
  public async updateAttribute(
    @response() res: Response,
    @requestParam('id') id: string,
    @requestBody() payload: UpdateAttributeDTO
  ) {
    const attribute = await this.attributeService.updateAttribute(id, payload);
    return this.sendResponse(res, 200, 'Attribute updated successfully', attribute);
  }

  // Delete attribute
  @httpDelete('/:id')
  public async deleteAttribute(@response() res: Response, @requestParam('id') id: string) {
    await this.attributeService.deleteAttribute(id);
    return this.sendResponse(res, 200, 'Attribute deleted successfully');
  }
}
