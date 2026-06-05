import { inject } from 'inversify';
import { controller, httpPost, request, requestBody, response } from 'inversify-express-utils';
import { Request, Response } from 'express';
import TYPES from '../di';
import { IUser } from '../models';
import { IConversationService } from '../services/ConversationService';
import { BaseController } from './BaseController';
import AppError from '../utils/errors/AppError';

@controller('/api/v1/seller')
export class SellerMessagingController extends BaseController {
  constructor(
    @inject(TYPES.ConversationService) private conversationService: IConversationService
  ) {
    super();
  }

  private getSellerId(req: Request): string {
    const user = req.user as IUser;
    const sellerId = user.seller?._id || user.seller;
    if (!sellerId) {
      throw new AppError('Seller account required', 403);
    }
    return sellerId.toString();
  }

  /** Seller can always open or continue a support thread with platform admin. */
  @httpPost('/messaging/admin', TYPES.RequireSignIn, TYPES.RequireSeller)
  async openAdminSupport(
    @response() res: Response,
    @request() req: Request,
    @requestBody() body: { text?: string }
  ) {
    const sellerId = this.getSellerId(req);
    const conversation = await this.conversationService.openAdminSupportForSeller(sellerId, {
      text: body?.text?.trim() || undefined,
    });
    return this.sendResponse(res, 200, 'Admin support conversation ready', conversation);
  }
}
