import { controller, httpGet, httpPatch, requestBody, response } from 'inversify-express-utils';
import { inject } from 'inversify';
import { Response } from 'express';
import TYPES from '../di';
import { BaseController } from './BaseController';
import { PlatformSettingsService } from '../services/PlatformSettingsService';
import { OrderApprovalMode } from '../models/PlatformSettings';
import AppError from '../utils/errors/AppError';

@controller('/api/v1')
export class PlatformSettingsController extends BaseController {
  constructor(
    @inject(TYPES.PlatformSettingsService)
    private platformSettingsService: PlatformSettingsService
  ) {
    super();
  }

  @httpGet('/admin/settings/platform', TYPES.RequireAdmin)
  async getAdminPlatformSettings(@response() res: Response) {
    const settings = await this.platformSettingsService.getPlatformSettings();
    return this.sendResponse(res, 200, 'Platform settings retrieved', settings);
  }

  @httpPatch('/admin/settings/platform', TYPES.RequireAdmin)
  async updateAdminPlatformSettings(
    @response() res: Response,
    @requestBody() body: { orderApprovalMode?: OrderApprovalMode }
  ) {
    const mode = body?.orderApprovalMode;
    if (!mode || !['ADMIN_ONLY', 'SELLER_ALLOWED'].includes(mode)) {
      throw new AppError('orderApprovalMode must be ADMIN_ONLY or SELLER_ALLOWED', 400);
    }
    const settings = await this.platformSettingsService.setOrderApprovalMode(mode);
    return this.sendResponse(res, 200, 'Platform settings updated', settings);
  }

  @httpGet('/seller/settings/order-approval', TYPES.RequireSignIn, TYPES.RequireSeller)
  async getSellerOrderApprovalSettings(@response() res: Response) {
    const settings = await this.platformSettingsService.getPlatformSettings();
    return this.sendResponse(res, 200, 'Order approval settings retrieved', {
      orderApprovalMode: settings.orderApprovalMode,
      sellerCanApproveOrders: settings.orderApprovalMode === 'SELLER_ALLOWED',
    });
  }
}
