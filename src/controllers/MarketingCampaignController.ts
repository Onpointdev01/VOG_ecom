import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPost,
  queryParam,
  requestBody,
  requestParam,
  response,
} from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import { BaseController } from './BaseController';
import { IMarketingCampaignService } from '../services/MarketingCampaignService';
import { CampaignPlacement } from '../models/MarketingCampaign';

@controller('/api/v1/marketing-campaigns')
export class MarketingCampaignController extends BaseController {
  constructor(
    @inject(TYPES.MarketingCampaignService)
    private campaignService: IMarketingCampaignService
  ) {
    super();
  }

  /** All currently valid campaigns (optional filters). */
  @httpGet('/active')
  public async getActiveCampaigns(
    @response() res: Response,
    @requestParam() _params: unknown,
    @requestBody() _body: unknown
  ) {
    const placement = (res.req.query.placement as CampaignPlacement) || undefined;
    const type = (res.req.query.type as string) || undefined;
    const productId = (res.req.query.productId as string) || undefined;
    const categoryId = (res.req.query.categoryId as string) || undefined;

    const campaigns = await this.campaignService.getActiveCampaigns({
      placement,
      type: type as any,
      productId,
      categoryId,
    });
    return this.sendResponse(res, 200, 'Active campaigns retrieved', campaigns);
  }

  /** Active campaigns for a specific placement. */
  @httpGet('/placement/:placement')
  public async getByPlacement(
    @response() res: Response,
    @requestParam('placement') placement: CampaignPlacement,
    @queryParam('productId') productId?: string,
    @queryParam('categoryId') categoryId?: string
  ) {
    const campaigns = await this.campaignService.getActiveByPlacement(placement, {
      productId,
      categoryId,
    });
    return this.sendResponse(res, 200, 'Campaigns retrieved', campaigns);
  }

  /** Validate coupon at checkout (authenticated). */
  @httpPost('/validate-coupon', TYPES.RequireSignIn)
  public async validateCoupon(
    @response() res: Response,
    @requestBody()
    body: { couponCode: string; shippingAddressId: string; selectedItems?: string[] }
  ) {
    const userId = res.locals.user;
    if (!body?.couponCode?.trim()) {
      return this.sendResponse(res, 400, 'Coupon code is required', null);
    }
    const result = await this.campaignService.validateCouponForUser(
      userId,
      body.couponCode,
      body.shippingAddressId,
      body.selectedItems
    );
    return this.sendResponse(res, 200, result.valid ? 'Coupon applied' : 'Coupon invalid', result);
  }
}
