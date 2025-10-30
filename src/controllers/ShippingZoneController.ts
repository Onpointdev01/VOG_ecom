import { inject } from 'inversify';
import { controller, httpDelete, httpGet, httpPost, httpPut, requestBody, requestParam, response } from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import { IShippingZoneService, CreateShippingZoneDTO, UpdateShippingZoneDTO } from '../services/ShippingZoneService';
import { BaseController } from './BaseController';

@controller('/api/v1/shipping-zones')
export class ShippingZoneController extends BaseController {
  constructor(@inject(TYPES.ShippingZoneService) private shippingZoneService: IShippingZoneService) {
    super();
  }

  // Get all shipping zones (Admin only)
  @httpGet('/', TYPES.RequireAdmin)
  public async getAllShippingZones(@response() res: Response) {
    const zones = await this.shippingZoneService.getAllShippingZones();
    return this.sendResponse(res, 200, 'Shipping zones fetched successfully', zones);
  }

  // Get active shipping zones (Public - for users to see available provinces)
  @httpGet('/active')
  public async getActiveShippingZones(@response() res: Response) {
    const zones = await this.shippingZoneService.getActiveShippingZones();
    return this.sendResponse(res, 200, 'Active shipping zones fetched successfully', zones);
  }

  // Get single shipping zone by ID (Admin only)
  @httpGet('/:id', TYPES.RequireAdmin)
  public async getShippingZoneById(@response() res: Response, @requestParam('id') id: string) {
    const zone = await this.shippingZoneService.getShippingZoneById(id);
    return this.sendResponse(res, 200, 'Shipping zone fetched successfully', zone);
  }

  // Calculate shipping fee by province code (Public - for checkout)
  @httpGet('/calculate/:provinceCode')
  public async calculateShippingFee(@response() res: Response, @requestParam('provinceCode') provinceCode: string) {
    const fee = await this.shippingZoneService.calculateShippingFee(provinceCode);
    return this.sendResponse(res, 200, 'Shipping fee calculated successfully', { shippingFee: fee });
  }

  // Create new shipping zone (Admin only)
  @httpPost('/', TYPES.RequireAdmin)
  public async createShippingZone(@response() res: Response, @requestBody() payload: CreateShippingZoneDTO) {
    const zone = await this.shippingZoneService.createShippingZone(payload);
    return this.sendResponse(res, 201, 'Shipping zone created successfully', zone);
  }

  // Update shipping zone (Admin only)
  @httpPut('/:id', TYPES.RequireAdmin)
  public async updateShippingZone(
    @response() res: Response,
    @requestParam('id') id: string,
    @requestBody() payload: UpdateShippingZoneDTO
  ) {
    const zone = await this.shippingZoneService.updateShippingZone(id, payload);
    return this.sendResponse(res, 200, 'Shipping zone updated successfully', zone);
  }

  // Delete shipping zone (Admin only)
  @httpDelete('/:id', TYPES.RequireAdmin)
  public async deleteShippingZone(@response() res: Response, @requestParam('id') id: string) {
    await this.shippingZoneService.deleteShippingZone(id);
    return this.sendResponse(res, 200, 'Shipping zone deleted successfully');
  }
}
