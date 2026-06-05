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
  IShippingZoneService,
  CreateShippingZoneDTO,
  UpdateShippingZoneDTO,
} from '../services/ShippingZoneService';
import { BaseController } from './BaseController';

@controller('/api/v1/shipping-zones')
export class ShippingZoneController extends BaseController {
  constructor(@inject(TYPES.ShippingZoneService) private shippingZoneService: IShippingZoneService) {
    super();
  }

  @httpGet('/', TYPES.RequireAdmin)
  public async getAllShippingZones(@response() res: Response) {
    const zones = await this.shippingZoneService.getAllShippingZones();
    return this.sendResponse(res, 200, 'Shipping zones fetched successfully', zones);
  }

  @httpGet('/active')
  public async getActiveShippingZones(@response() res: Response) {
    const zones = await this.shippingZoneService.getActiveShippingZones();
    return this.sendResponse(res, 200, 'Active shipping zones fetched successfully', zones);
  }

  @httpGet('/:id', TYPES.RequireAdmin)
  public async getShippingZoneById(@response() res: Response, @requestParam('id') id: string) {
    const zone = await this.shippingZoneService.getShippingZoneById(id);
    return this.sendResponse(res, 200, 'Shipping zone fetched successfully', zone);
  }

  /** Calculate fee by quartier code or name (public — checkout) */
  @httpGet('/calculate/:neighborhoodCode')
  public async calculateShippingFee(
    @response() res: Response,
    @requestParam('neighborhoodCode') neighborhoodCode: string
  ) {
    const fee = await this.shippingZoneService.calculateShippingFee(
      decodeURIComponent(neighborhoodCode)
    );
    return this.sendResponse(res, 200, 'Shipping fee calculated successfully', { shippingFee: fee });
  }

  @httpPost('/', TYPES.RequireAdmin)
  public async createShippingZone(
    @response() res: Response,
    @requestBody() payload: CreateShippingZoneDTO
  ) {
    const zone = await this.shippingZoneService.createShippingZone(payload);
    return this.sendResponse(res, 201, 'Shipping zone created successfully', zone);
  }

  @httpPut('/:id', TYPES.RequireAdmin)
  public async updateShippingZone(
    @response() res: Response,
    @requestParam('id') id: string,
    @requestBody() payload: UpdateShippingZoneDTO
  ) {
    const zone = await this.shippingZoneService.updateShippingZone(id, payload);
    return this.sendResponse(res, 200, 'Shipping zone updated successfully', zone);
  }

  @httpDelete('/:id', TYPES.RequireAdmin)
  public async deleteShippingZone(@response() res: Response, @requestParam('id') id: string) {
    await this.shippingZoneService.deleteShippingZone(id);
    return this.sendResponse(res, 200, 'Shipping zone deleted successfully');
  }
}
