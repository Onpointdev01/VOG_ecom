import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPost,
  httpPut,
  request,
  requestBody,
  requestParam,
  response,
  queryParam,
} from 'inversify-express-utils';
import { Request, Response } from 'express';
import joiMiddleware from '../middlewares/joiMiddleware';
import TYPES from '../di';
import { IUser } from '../models';
import { IConversationService, SellerScopeOptions } from '../services/ConversationService';
import { IMessageService } from '../services/MessageService';
import {
  attachProductParamSchema,
  conversationIdParamSchema,
  createConversationSchema,
  productIdParamSchema,
  sellerIdParamSchema,
  sendMessageSchema,
} from '../validators/conversation.validators';
import { BaseController } from './BaseController';

@controller('/api/v1/conversations')
export class ConversationController extends BaseController {
  constructor(
    @inject(TYPES.ConversationService) private conversationService: IConversationService,
    @inject(TYPES.MessageService) private messageService: IMessageService
  ) {
    super();
  }

  private resolveSellerScope(req: Request): SellerScopeOptions | undefined {
    const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined;
    const user = req.user as IUser;
    const sellerRef = user.seller?._id || user.seller;
    if (scope === 'seller' && sellerRef) {
      return { sellerDocId: sellerRef.toString() };
    }
    return undefined;
  }

  @httpPost(
    '/seller/:sellerId',
    TYPES.RequireSignIn,
    joiMiddleware(sellerIdParamSchema, 'params'),
    joiMiddleware(createConversationSchema)
  )
  async createOrGetStore(
    @response() res: Response,
    @request() req: Request,
    @requestParam('sellerId') sellerId: string,
    @requestBody() body: { text?: string }
  ) {
    const user = req.user as IUser;
    const conversation = await this.conversationService.createOrGetStoreConversation(
      sellerId,
      (user._id as string).toString(),
      { text: body.text }
    );
    return this.sendResponse(res, 200, 'Store conversation ready', conversation);
  }

  @httpPost(
    '/product/:productId',
    TYPES.RequireSignIn,
    joiMiddleware(productIdParamSchema, 'params'),
    joiMiddleware(createConversationSchema)
  )
  async createOrGet(
    @response() res: Response,
    @request() req: Request,
    @requestParam('productId') productId: string,
    @requestBody() body: { text?: string }
  ) {
    const user = req.user as IUser;
    const conversation = await this.conversationService.createOrGetConversation(
      productId,
      (user._id as string).toString(),
      { text: body.text }
    );

    return this.sendResponse(res, 200, 'Conversation ready', conversation);
  }

  @httpGet('/', TYPES.RequireSignIn)
  async list(
    @response() res: Response,
    @request() req: Request,
    @queryParam('scope') scope?: string
  ) {
    const user = req.user as IUser;
    const userId = (user._id as { toString(): string }).toString();
    const sellerRef = user.seller?._id || user.seller;

    const conversations =
      scope === 'seller' && sellerRef
        ? await this.conversationService.getSellerConversations(
            userId,
            sellerRef.toString()
          )
        : await this.conversationService.getUserConversations(userId);

    return this.sendResponse(res, 200, 'Conversations retrieved successfully', conversations);
  }

  @httpGet(
    '/:conversationId',
    TYPES.RequireSignIn,
    joiMiddleware(conversationIdParamSchema, 'params')
  )
  async getDetail(
    @response() res: Response,
    @request() req: Request,
    @requestParam('conversationId') conversationId: string
  ) {
    const user = req.user as IUser;
    const userId = (user._id as { toString(): string }).toString();
    const sellerScope = this.resolveSellerScope(req);
    const conversation = await this.conversationService.getConversationDetail(
      conversationId,
      userId,
      sellerScope ? { sellerScope } : undefined
    );
    return this.sendResponse(res, 200, 'Conversation retrieved successfully', conversation);
  }

  @httpPost(
    '/:conversationId/products/:productId',
    TYPES.RequireSignIn,
    joiMiddleware(attachProductParamSchema, 'params')
  )
  async attachProduct(
    @response() res: Response,
    @request() req: Request,
    @requestParam('conversationId') conversationId: string,
    @requestParam('productId') productId: string
  ) {
    const user = req.user as IUser;
    const userId = (user._id as string).toString();
    await this.conversationService.attachProductToConversation(
      conversationId,
      productId,
      userId
    );
    const conversation = await this.conversationService.getConversationDetail(
      conversationId,
      userId
    );
    return this.sendResponse(res, 200, 'Product attached to conversation', conversation);
  }

  @httpGet(
    '/:conversationId/messages',
    TYPES.RequireSignIn,
    joiMiddleware(conversationIdParamSchema, 'params')
  )
  async getMessages(
    @response() res: Response,
    @request() req: Request,
    @requestParam('conversationId') conversationId: string
  ) {
    const user = req.user as IUser;
    const userId = (user._id as { toString(): string }).toString();
    const sellerScope = this.resolveSellerScope(req);
    const messages = await this.messageService.getMessagesForConversation(
      conversationId,
      userId,
      sellerScope ? { sellerScope } : undefined
    );
    return this.sendResponse(res, 200, 'Messages retrieved successfully', messages);
  }

  @httpPost(
    '/:conversationId/messages',
    TYPES.RequireSignIn,
    joiMiddleware(conversationIdParamSchema, 'params'),
    joiMiddleware(sendMessageSchema)
  )
  async sendMessage(
    @response() res: Response,
    @request() req: Request,
    @requestParam('conversationId') conversationId: string,
    @requestBody() body: { text: string; productId?: string }
  ) {
    const user = req.user as IUser;
    const userId = (user._id as { toString(): string }).toString();
    const sellerScope = this.resolveSellerScope(req);
    if (sellerScope) {
      await this.conversationService.getConversationForUser(conversationId, userId, {
        sellerScope,
      });
    }
    const message = await this.messageService.sendMessageInConversation(
      conversationId,
      userId,
      body.text,
      undefined,
      body.productId || null
    );
    return this.sendResponse(res, 201, 'Message sent successfully', message);
  }

  @httpPut(
    '/:conversationId/read',
    TYPES.RequireSignIn,
    joiMiddleware(conversationIdParamSchema, 'params')
  )
  async markRead(
    @response() res: Response,
    @request() req: Request,
    @requestParam('conversationId') conversationId: string
  ) {
    const user = req.user as IUser;
    const userId = (user._id as { toString(): string }).toString();
    const sellerScope = this.resolveSellerScope(req);
    const conversation = await this.conversationService.markConversationRead(
      conversationId,
      userId,
      sellerScope ? { sellerScope } : undefined
    );
    return this.sendResponse(res, 200, 'Conversation marked as read', conversation);
  }

  @httpPut(
    '/:conversationId/close',
    TYPES.RequireSignIn,
    joiMiddleware(conversationIdParamSchema, 'params')
  )
  async close(
    @response() res: Response,
    @request() req: Request,
    @requestParam('conversationId') conversationId: string
  ) {
    const user = req.user as IUser;
    const conversation = await this.conversationService.closeConversation(
      conversationId,
      (user._id as string).toString()
    );
    return this.sendResponse(res, 200, 'Conversation closed', conversation);
  }
}
