import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPost,
  request,
  requestBody,
  requestParam,
  response,
} from 'inversify-express-utils';
import { Request, Response } from 'express';
import joiMiddleware from '../middlewares/joiMiddleware';
import TYPES from '../di';
import { IAdmin } from '../models';
import { IAdminMessagingService } from '../services/AdminMessagingService';
import { BaseController } from './BaseController';
import {
  adminBroadcastEmailSchema,
  adminChatMessageSchema,
  adminConversationIdSchema,
  adminSellerIdSchema,
  adminOpenConversationSchema,
  adminEmailBroadcastIdSchema,
} from '../validators/adminMessaging.validators';

@controller('/api/v1/admin/messaging', TYPES.RequireAdmin)
export class AdminMessagingController extends BaseController {
  constructor(
    @inject(TYPES.AdminMessagingService) private adminMessagingService: IAdminMessagingService
  ) {
    super();
  }

  @httpGet('/sellers')
  async listSellers(@response() res: Response) {
    const sellers = await this.adminMessagingService.listSellersForPicker();
    return this.sendResponse(res, 200, 'Sellers retrieved', sellers);
  }

  /** In-app: list admin ↔ seller support threads only */
  @httpGet('/conversations')
  async listSellerConversations(@response() res: Response, @request() req: Request) {
    const admin = req.admin as IAdmin;
    const conversations = await this.adminMessagingService.listSellerConversations(admin);
    return this.sendResponse(res, 200, 'Seller conversations retrieved', conversations);
  }

  @httpPost(
    '/conversations/seller/:sellerId',
    joiMiddleware(adminSellerIdSchema, 'params'),
    joiMiddleware(adminOpenConversationSchema)
  )
  async openSellerConversation(
    @response() res: Response,
    @request() req: Request,
    @requestParam('sellerId') sellerId: string,
    @requestBody() body: { text?: string }
  ) {
    const admin = req.admin as IAdmin;
    const conversation = await this.adminMessagingService.openSellerConversation(
      admin,
      sellerId,
      body.text
    );
    return this.sendResponse(res, 200, 'Seller conversation ready', conversation);
  }

  @httpGet(
    '/conversations/:conversationId/messages',
    joiMiddleware(adminConversationIdSchema, 'params')
  )
  async getMessages(
    @response() res: Response,
    @request() req: Request,
    @requestParam('conversationId') conversationId: string
  ) {
    const admin = req.admin as IAdmin;
    const data = await this.adminMessagingService.getConversationMessages(admin, conversationId);
    return this.sendResponse(res, 200, 'Messages retrieved', data);
  }

  @httpPost(
    '/conversations/:conversationId/messages',
    joiMiddleware(adminConversationIdSchema, 'params'),
    joiMiddleware(adminChatMessageSchema)
  )
  async sendMessage(
    @response() res: Response,
    @request() req: Request,
    @requestParam('conversationId') conversationId: string,
    @requestBody() body: { text: string }
  ) {
    const admin = req.admin as IAdmin;
    const message = await this.adminMessagingService.sendAdminChatMessage(
      admin,
      conversationId,
      body.text
    );
    return this.sendResponse(res, 201, 'Message sent', message);
  }

  /** Sent email history (broadcasts), not chat threads */
  @httpGet('/email/broadcasts')
  async listEmailBroadcasts(@response() res: Response) {
    const emails = await this.adminMessagingService.listEmailBroadcasts();
    return this.sendResponse(res, 200, 'Email broadcasts retrieved', emails);
  }

  @httpGet('/email/broadcasts/:broadcastId', joiMiddleware(adminEmailBroadcastIdSchema, 'params'))
  async getEmailBroadcast(
    @response() res: Response,
    @requestParam('broadcastId') broadcastId: string
  ) {
    const email = await this.adminMessagingService.getEmailBroadcast(broadcastId);
    return this.sendResponse(res, 200, 'Email broadcast retrieved', email);
  }

  /** Email broadcast — not in-app chat; goes directly to user mailboxes */
  @httpPost('/email/broadcast', joiMiddleware(adminBroadcastEmailSchema))
  async broadcastEmail(
    @response() res: Response,
    @request() req: Request,
    @requestBody()
    body: {
      audience: 'buyers' | 'sellers' | 'everyone';
      subject: string;
      html?: string;
      text?: string;
    }
  ) {
    const admin = req.admin as IAdmin;
    try {
      const result = await this.adminMessagingService.sendBroadcastEmail(admin, body);
      const message =
        result.failed > 0
          ? `Email sent to ${result.sent} of ${result.total} recipient(s) (${result.failed} failed)`
          : `Email sent to ${result.sent} recipient(s)`;
      return this.sendResponse(res, 200, message, result);
    } catch (err) {
      if (err instanceof Error && err.name === 'EmailDeliveryError') {
        return this.sendResponse(res, 503, err.message, null);
      }
      throw err;
    }
  }
}
