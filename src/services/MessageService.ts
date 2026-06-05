import { inject, injectable } from 'inversify';
import { ClientSession, Model } from 'mongoose';
import TYPES from '../di';
import { IConversation, IMessage, IUser, MessageType } from '../models';
import AppError from '../utils/errors/AppError';
import { isSelfStoreInteraction, OWN_STORE_ERROR } from '../utils/offerRules';
import { BaseService } from './BaseService';
import { toIdString } from '../utils/mongoId';
import {
  buildBuyerInitiatedMessageFilter,
  canAccessConversationAsSeller,
} from '../utils/sellerAccess';
import { NotificationService } from './NotificationService';

export interface IMessageService {
  sendTextMessage(
    conversationId: string,
    senderId: string,
    recipientId: string,
    productId: string | null,
    text: string,
    session?: ClientSession
  ): Promise<IMessage>;
  createTypedMessage(params: {
    conversationId: string;
    senderId: string;
    recipientId: string;
    productId?: string | null;
    offerId?: string;
    type: MessageType;
    text: string;
    session?: ClientSession;
  }): Promise<IMessage>;
  getMessagesForConversation(
    conversationId: string,
    userId: string,
    options?: { sellerScope?: { sellerDocId: string } }
  ): Promise<IMessage[]>;
  markMessagesRead(conversationId: string, userId: string): Promise<void>;
  sendMessageInConversation(
    conversationId: string,
    senderId: string,
    text: string,
    session?: ClientSession,
    productId?: string | null
  ): Promise<IMessage>;
  getAllMessagesForAdmin(
    filters: { productId?: string; type?: string; conversationId?: string },
    page: number,
    limit: number
  ): Promise<{ messages: IMessage[]; total: number; page: number; totalPages: number }>;
}

@injectable()
export class MessageService extends BaseService implements IMessageService {
  constructor(
    @inject(TYPES.Message) private Message: Model<IMessage>,
    @inject(TYPES.Conversation) private Conversation: Model<IConversation>,
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.NotificationService) private notificationService: NotificationService
  ) {
    super();
  }

  private async assertBuyerNotOwnStore(
    conversation: IConversation,
    senderId: string
  ): Promise<void> {
    if (conversation.type === 'ADMIN_SELLER') return;
    const buyerId = conversation.buyer ? toIdString(conversation.buyer) : '';
    if (!buyerId || senderId !== buyerId) return;

    const sellerId = toIdString(conversation.seller);
    const sellerUserId = toIdString(conversation.sellerUser);
    const buyer = await this.User.findById(buyerId).select('seller').lean();
    if (isSelfStoreInteraction(buyerId, sellerId, sellerUserId, buyer as IUser)) {
      throw new AppError(OWN_STORE_ERROR, 400, 'OWN_STORE');
    }
  }

  private async assertParticipant(conversationId: string, userId: string): Promise<IConversation> {
    const conversation = await this.Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    return conversation;
  }

  private otherParticipant(conversation: IConversation, userId: string): string {
    if (conversation.type === 'ADMIN_SELLER') {
      const sellerUserId = toIdString(conversation.sellerUser);
      if (userId !== sellerUserId) {
        return sellerUserId;
      }
      const participantIds = (conversation.participants || []).map((p) => toIdString(p));
      const adminUserId = participantIds.find((id) => id !== sellerUserId);
      if (!adminUserId) {
        throw new AppError('Conversation participant not found', 500);
      }
      return adminUserId;
    }

    const buyerId = conversation.buyer ? toIdString(conversation.buyer) : '';
    if (!buyerId) {
      throw new AppError('Conversation participant not found', 500);
    }
    const sellerUserId = toIdString(conversation.sellerUser);
    return buyerId === userId ? sellerUserId : buyerId;
  }

  async sendTextMessage(
    conversationId: string,
    senderId: string,
    recipientId: string,
    productId: string | null,
    text: string,
    session?: ClientSession
  ): Promise<IMessage> {
    return this.createTypedMessage({
      conversationId,
      senderId,
      recipientId,
      productId,
      type: 'TEXT',
      text,
      session,
    });
  }

  async createTypedMessage(params: {
    conversationId: string;
    senderId: string;
    recipientId: string;
    productId?: string | null;
    offerId?: string;
    type: MessageType;
    text: string;
    session?: ClientSession;
  }): Promise<IMessage> {
    const { conversationId, senderId, recipientId, productId, offerId, type, text, session } =
      params;

    const messageData: Record<string, unknown> = {
      conversation: conversationId,
      sender: senderId,
      recipient: recipientId,
      product: productId,
      type,
      text,
    };

    if (offerId) {
      messageData.offer = offerId;
    }

    const created = await this.Message.create([messageData], { session });
    const message = created[0];

    const conversation = await this.Conversation.findById(conversationId).session(session || null);
    const unreadUpdate: Record<string, number> = {};
    if (conversation) {
      if (conversation.type === 'ADMIN_SELLER') {
        const sellerUserId = toIdString(conversation.sellerUser);
        if (recipientId === sellerUserId) {
          unreadUpdate.unreadBySeller = 1;
        } else {
          unreadUpdate.unreadByAdmin = 1;
        }
      } else {
        const buyerId = conversation.buyer ? toIdString(conversation.buyer) : '';
        const recipientIsBuyer = buyerId && buyerId === recipientId;
        if (recipientIsBuyer) {
          unreadUpdate.unreadByBuyer = 1;
        } else {
          unreadUpdate.unreadBySeller = 1;
        }
      }
    }

    await this.Conversation.updateOne(
      { _id: conversationId },
      {
        lastMessage: text,
        lastMessageAt: new Date(),
        ...(Object.keys(unreadUpdate).length ? { $inc: unreadUpdate } : {}),
      },
      { session }
    );

    return message;
  }

  private async notifyTextMessageRecipient(
    conversationId: string,
    senderId: string,
    recipientId: string,
    text: string,
    message: IMessage
  ): Promise<void> {
    try {
      const conversation = await this.Conversation.findById(conversationId)
        .populate('seller', 'name')
        .populate('buyer', 'firstName lastName')
        .lean();
      if (!conversation) return;

      if (conversation.type === 'ADMIN_SELLER') {
        const sellerUserId = toIdString(conversation.sellerUser);
        const recipientIsSeller = recipientId === sellerUserId;
        const sender = await this.User.findById(senderId).select('firstName lastName').lean();
        const sellerName = (conversation.seller as { name?: string })?.name || 'Seller';
        const adminName = sender
          ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Support'
          : 'Support';
        const senderLabel = recipientIsSeller ? adminName : sellerName;

        await this.notificationService.notifyNewMessage({
          recipientId,
          senderLabel,
          preview: text,
          messageId: toIdString(message._id),
          conversationId,
          recipientRole: recipientIsSeller ? 'seller' : 'buyer',
        });
        return;
      }

      const buyerId = conversation.buyer ? toIdString(conversation.buyer) : '';
      const recipientIsBuyer = buyerId === recipientId;
      const sender = await this.User.findById(senderId).select('firstName lastName seller').lean();
      const sellerName =
        (conversation.seller as { name?: string })?.name || 'Store';
      const buyerName = sender
        ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Buyer'
        : 'Buyer';
      const senderLabel = recipientIsBuyer ? sellerName : buyerName;
      const productId = conversation.contextProduct
        ? toIdString(conversation.contextProduct)
        : conversation.product
          ? toIdString(conversation.product)
          : undefined;

      await this.notificationService.notifyNewMessage({
        recipientId,
        senderLabel,
        preview: text,
        messageId: toIdString(message._id),
        conversationId,
        productId,
        recipientRole: recipientIsBuyer ? 'buyer' : 'seller',
      });
    } catch (err) {
      console.error('Failed to send message notification:', err);
    }
  }

  async getMessagesForConversation(
    conversationId: string,
    userId: string,
    options?: { sellerScope?: { sellerDocId: string } }
  ): Promise<IMessage[]> {
    const conversation = await this.assertParticipant(conversationId, userId);
    if (options?.sellerScope) {
      if (
        !canAccessConversationAsSeller(
          conversation,
          userId,
          options.sellerScope.sellerDocId
        )
      ) {
        throw new AppError('Conversation not found', 404);
      }
    }

    return this.Message.find({ conversation: conversationId })
      .populate('sender', 'firstName lastName email')
      .populate('recipient', 'firstName lastName email')
      .populate('offer')
      .sort({ createdAt: 1 });
  }

  async markMessagesRead(conversationId: string, userId: string): Promise<void> {
    await this.assertParticipant(conversationId, userId);

    await this.Message.updateMany(
      { conversation: conversationId, recipient: userId, readAt: null },
      { readAt: new Date() }
    );
  }

  private resolveProductId(conversation: IConversation): string | null {
    if (conversation.contextProduct) {
      return toIdString(conversation.contextProduct);
    }
    if (conversation.product) {
      return toIdString(conversation.product);
    }
    return null;
  }

  private async assertSellerMayReplyToBuyer(
    conversation: IConversation,
    senderId: string
  ): Promise<void> {
    if (conversation.type === 'ADMIN_SELLER') {
      return;
    }

    const sellerUserId = toIdString(conversation.sellerUser);
    if (senderId !== sellerUserId) {
      return;
    }

    const buyerId = conversation.buyer ? toIdString(conversation.buyer) : '';
    if (!buyerId) {
      throw new AppError('Conversation not found', 404);
    }

    const buyerStarted = await this.Message.exists(
      buildBuyerInitiatedMessageFilter(conversation._id, buyerId)
    );

    if (!buyerStarted) {
      throw new AppError(
        'You can reply after the buyer starts the conversation (message or offer)',
        403,
        'SELLER_BUYER_REPLY_BLOCKED'
      );
    }
  }

  async sendMessageInConversation(
    conversationId: string,
    senderId: string,
    text: string,
    session?: ClientSession,
    productId?: string | null
  ): Promise<IMessage> {
    const conversation = await this.assertParticipant(conversationId, senderId);
    await this.assertBuyerNotOwnStore(conversation, senderId);
    await this.assertSellerMayReplyToBuyer(conversation, senderId);
    const recipientId = this.otherParticipant(conversation, senderId);
    const resolvedProduct =
      productId !== undefined ? productId : this.resolveProductId(conversation);

    const message = await this.sendTextMessage(
      conversationId,
      senderId,
      recipientId,
      resolvedProduct,
      text,
      session
    );

    if (!session) {
      void this.notifyTextMessageRecipient(conversationId, senderId, recipientId, text, message);
    }

    return message;
  }

  async getAllMessagesForAdmin(
    filters: { productId?: string; type?: string; conversationId?: string },
    page: number,
    limit: number
  ): Promise<{ messages: IMessage[]; total: number; page: number; totalPages: number }> {
    const query: Record<string, unknown> = {};

    if (filters.productId) {
      query.product = filters.productId;
    }
    if (filters.type) {
      query.type = filters.type;
    }
    if (filters.conversationId) {
      query.conversation = filters.conversationId;
    }

    const total = await this.Message.countDocuments(query);
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const messages = await this.Message.find(query)
      .populate('sender', 'firstName lastName email')
      .populate('recipient', 'firstName lastName email')
      .populate('product', 'name images price')
      .populate('offer')
      .populate('conversation')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return { messages, total, page, totalPages };
  }
}
