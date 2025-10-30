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
  IAttributeValueService,
  CreateAttributeValueDTO,
  UpdateAttributeValueDTO,
} from '../services/AttributeValueService';
import { BaseController } from './BaseController';

@controller('/api/v1/admin/attribute-values', TYPES.RequireAdmin)
export class AttributeValueController extends BaseController {
  constructor(
    @inject(TYPES.AttributeValueService) private attributeValueService: IAttributeValueService
  ) {
    super();
  }

  // Get all values for an attribute
  @httpGet('/attribute/:attributeId')
  public async getAttributeValues(
    @response() res: Response,
    @requestParam('attributeId') attributeId: string
  ) {
    const values = await this.attributeValueService.getAttributeValues(attributeId);
    return this.sendResponse(res, 200, 'Attribute values fetched successfully', values);
  }

  // Get active values for an attribute (public - for product forms)
  @httpGet('/attribute/:attributeId/active')
  public async getActiveAttributeValues(
    @response() res: Response,
    @requestParam('attributeId') attributeId: string
  ) {
    const values = await this.attributeValueService.getActiveAttributeValues(attributeId);
    return this.sendResponse(res, 200, 'Active attribute values fetched successfully', values);
  }

  // Get single attribute value by ID
  @httpGet('/:id')
  public async getAttributeValueById(@response() res: Response, @requestParam('id') id: string) {
    const value = await this.attributeValueService.getAttributeValueById(id);
    return this.sendResponse(res, 200, 'Attribute value fetched successfully', value);
  }

  // Create new attribute value
  @httpPost('/')
  public async createAttributeValue(
    @response() res: Response,
    @requestBody() payload: CreateAttributeValueDTO
  ) {
    const value = await this.attributeValueService.createAttributeValue(payload);
    return this.sendResponse(res, 201, 'Attribute value created successfully', value);
  }

  // Bulk create attribute values
  @httpPost('/bulk')
  public async bulkCreateAttributeValues(
    @response() res: Response,
    @requestBody() payload: { attributeId: string; values: string[] }
  ) {
    const { attributeId, values } = payload;
    const created = await this.attributeValueService.bulkCreateAttributeValues(
      attributeId,
      values
    );
    return this.sendResponse(
      res,
      201,
      `${created.length} attribute values created successfully`,
      created
    );
  }

  // Update attribute value
  @httpPut('/:id')
  public async updateAttributeValue(
    @response() res: Response,
    @requestParam('id') id: string,
    @requestBody() payload: UpdateAttributeValueDTO
  ) {
    const value = await this.attributeValueService.updateAttributeValue(id, payload);
    return this.sendResponse(res, 200, 'Attribute value updated successfully', value);
  }

  // Delete attribute value
  @httpDelete('/:id')
  public async deleteAttributeValue(@response() res: Response, @requestParam('id') id: string) {
    await this.attributeValueService.deleteAttributeValue(id);
    return this.sendResponse(res, 200, 'Attribute value deleted successfully');
  }
}
