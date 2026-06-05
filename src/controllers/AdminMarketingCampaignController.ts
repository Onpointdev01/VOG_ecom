import { inject } from 'inversify';
import {
  controller,
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
  httpPut,
  queryParam,
  requestBody,
  requestParam,
  response,
} from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import { BaseController } from './BaseController';
import {
  IMarketingCampaignService,
  CreateMarketingCampaignDTO,
  UpdateMarketingCampaignDTO,
} from '../services/MarketingCampaignService';
import { CampaignLifecycleStatus } from '../models/MarketingCampaign';

@controller('/api/v1/admin/marketing-campaigns', TYPES.RequireAdmin)
export class AdminMarketingCampaignController extends BaseController {
  constructor(
    @inject(TYPES.MarketingCampaignService)
    private campaignService: IMarketingCampaignService
  ) {
    super();
  }

  @httpGet('/')
  public async list(
    @response() res: Response,
    @queryParam('status') status?: CampaignLifecycleStatus
  ) {
    const campaigns = await this.campaignService.listCampaigns(
      status ? { status } : undefined
    );
    return this.sendResponse(res, 200, 'Campaigns retrieved', campaigns);
  }

  @httpGet('/:id')
  public async getById(@response() res: Response, @requestParam('id') id: string) {
    const campaign = await this.campaignService.getCampaignById(id);
    return this.sendResponse(res, 200, 'Campaign retrieved', campaign);
  }

  @httpPost('/')
  public async create(
    @response() res: Response,
    @requestBody() payload: CreateMarketingCampaignDTO
  ) {
    const adminId = res.locals.admin;
    const campaign = await this.campaignService.createCampaign(adminId, payload);
    return this.sendResponse(res, 201, 'Campaign created', campaign);
  }

  @httpPut('/:id')
  public async update(
    @response() res: Response,
    @requestParam('id') id: string,
    @requestBody() payload: UpdateMarketingCampaignDTO
  ) {
    const campaign = await this.campaignService.updateCampaign(id, payload);
    return this.sendResponse(res, 200, 'Campaign updated', campaign);
  }

  @httpDelete('/:id')
  public async remove(@response() res: Response, @requestParam('id') id: string) {
    await this.campaignService.deleteCampaign(id);
    return this.sendResponse(res, 200, 'Campaign deleted');
  }

  @httpPatch('/:id/activate')
  public async activate(@response() res: Response, @requestParam('id') id: string) {
    const campaign = await this.campaignService.setActive(id, true);
    return this.sendResponse(res, 200, 'Campaign activated', campaign);
  }

  @httpPatch('/:id/deactivate')
  public async deactivate(@response() res: Response, @requestParam('id') id: string) {
    const campaign = await this.campaignService.setActive(id, false);
    return this.sendResponse(res, 200, 'Campaign deactivated', campaign);
  }
}
