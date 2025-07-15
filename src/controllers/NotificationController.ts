import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPut,
  requestParam,
  response,
  request,
  queryParam,
} from 'inversify-express-utils';
import { Response, Request } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IBidMessageService } from '../services';
import { IUser } from '../models';

@controller('/api/v1/notifications')
export class NotificationController extends BaseController {
  constructor(
    @inject(TYPES.BidMessageService) private bidMessageService: IBidMessageService
  ) {
    super();
  }

  @httpGet('/bid-messages', TYPES.RequireSignIn)
  async getBidMessages(
    @response() res: Response,
    @request() req: Request,
    @queryParam('productId') productId?: string
  ) {
    const user = req.user as IUser;
    
    const messages = await this.bidMessageService.getBidMessages(
      (user._id as string).toString(),
      productId
    );

    return this.sendResponse(res, 200, 'Bid messages retrieved successfully', messages);
  }

  @httpPut('/bid-messages/:messageId/read', TYPES.RequireSignIn)
  async markMessageAsRead(
    @response() res: Response,
    @request() req: Request,
    @requestParam('messageId') messageId: string
  ) {
    const user = req.user as IUser;
    
    const message = await this.bidMessageService.markMessageAsRead(
      messageId,
      (user._id as string).toString()
    );

    return this.sendResponse(res, 200, 'Message marked as read', message);
  }
}