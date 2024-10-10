import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPost,
  httpPut,
  httpDelete,
  requestBody,
  requestParam,
  response,
} from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import { IPaymentOptionService } from '../services';
import { BaseController } from './BaseController';
import { CreatePaymentOptionDTO, UpdatePaymentOptionDTO } from '../utils/dtos';

@controller('/api/v1/payment-options')
export class PaymentOptionController extends BaseController {
  constructor(@inject(TYPES.PaymentOptionService) private paymentService: IPaymentOptionService) {
    super();
  }

  // Get all payment options
  @httpGet('/')
  public async getPaymentOptions(@response() res: Response) {
    const paymentOptions = await this.paymentService.getAllPaymentOptions();
    return this.sendResponse(res, 200, 'Payment options fetched successfully', paymentOptions);
  }

  // Create a new payment option (admin only)
  @httpPost('/')
  public async createPaymentOption(@response() res: Response, @requestBody() payload: CreatePaymentOptionDTO) {
    const paymentOption = await this.paymentService.createPaymentOption(payload);
    return this.sendResponse(res, 201, 'Payment option created successfully', paymentOption);
  }

  // Update an existing payment option (admin only)
  @httpPut('/:id')
  public async updatePaymentOption(
    @response() res: Response,
    @requestParam('id') id: string,
    @requestBody() payload: UpdatePaymentOptionDTO
  ) {
    const updatedPaymentOption = await this.paymentService.updatePaymentOption(id, payload);
    return this.sendResponse(res, 200, 'Payment option updated successfully', updatedPaymentOption);
  }

  // Delete a payment option (admin only)
  @httpDelete('/:id')
  public async deletePaymentOption(@response() res: Response, @requestParam('id') id: string) {
    await this.paymentService.deletePaymentOption(id);
    return this.sendResponse(res, 200, 'Payment option deleted successfully');
  }
}
