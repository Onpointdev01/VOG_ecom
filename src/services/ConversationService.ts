import { inject, injectable } from 'inversify';
import mongoose, { ClientSession, Model } from 'mongoose';
import TYPES from '../di';
import {
  IAdmin,
  IConversation,
  IConversationProduct,
  IMessage,
  IProduct,
  ISeller,
  IUser,
} from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import { IMessageService } from './MessageService';
import { serializeConversation } from '../utils/conversationSerializer';
import { isValidMongoId, toIdString } from '../utils/mongoId';
import { resolveAdminChatUserId } from '../utils/resolveAdminChatUser';
import { resolveSellerUserId } from '../utils/resolveSellerUser';
import {
  isBuyerProductOwner,
  isSelfStoreInteraction,
  OWN_STORE_ERROR,
} from '../utils/offerRules';
import {
  buildBuyerInitiatedMessageFilter,
  buildSellerConversationFilter,
  canAccessConversationAsSeller,
} from '../utils/sellerAccess';
import { NotificationService } from './NotificationService';

export interface SellerScopeOptions {
  sellerDocId: string;
}

export interface SellerContext {
  product: IProduct;
  seller: ISeller;
  sellerUserId: string;
  sellerId: string;
}

export type ConversationDto = ReturnType<typeof serializeConversation>;

export interface IConversationService {
  resolveSellerContext(productId: string): Promise<SellerContext>;
  resolveSellerById(sellerId: string): Promise<{ seller: ISeller; sellerUserId: string }>;
  createOrGetStoreConversation(
    sellerId: string,
    buyerId: string,
    options?: { text?: string; session?: ClientSession }
  ): Promise<ConversationDto>;
  attachProductToConversation(
    conversationId: string,
    productId: string,
    buyerId: string,
    options?: { session?: ClientSession; setAsContext?: boolean }
  ): Promise<void>;
  createOrGetConversation(
    productId: string,
    buyerId: string,
    options?: { text?: string; session?: ClientSession }
  ): Promise<ConversationDto>;
  getConversationDetail(
    conversationId: string,
    userId: string,
    options?: { sellerScope?: SellerScopeOptions }
  ): Promise<ConversationDto>;
  getUserConversations(userId: string): Promise<ConversationDto[]>;
  getSellerConversations(userId: string, sellerDocId: string): Promise<ConversationDto[]>;
  getConversationForUser(
    conversationId: string,
    userId: string,
    options?: { sellerScope?: SellerScopeOptions }
  ): Promise<IConversation>;
  closeConversation(conversationId: string, userId: string): Promise<ConversationDto>;
  incrementUnread(
    conversationId: string,
    forRole: 'buyer' | 'seller',
    session?: ClientSession
  ): Promise<void>;
  updateConversationPreview(
    conversationId: string,
    text: string,
    session?: ClientSession
  ): Promise<void>;
  markConversationRead(
    conversationId: string,
    userId: string,
    options?: { sellerScope?: SellerScopeOptions }
  ): Promise<ConversationDto>;
  createOrGetAdminSellerConversation(
    admin: IAdmin,
    sellerId: string,
    options?: { text?: string; session?: ClientSession }
  ): Promise<ConversationDto>;
  getAdminSellerConversations(adminId: string): Promise<ConversationDto[]>;
  getConversationDetailForAdmin(
    conversationId: string,
    adminChatUserId: string
  ): Promise<ConversationDto>;
  markConversationReadForAdmin(
    conversationId: string,
    adminChatUserId: string
  ): Promise<ConversationDto>;
  openAdminSupportForSeller(
    sellerDocId: string,
    options?: { text?: string }
  ): Promise<ConversationDto>;
}

@injectable()
export class ConversationService extends BaseService implements IConversationService {
  constructor(
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.Seller) private Seller: Model<ISeller>,
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Admin) private Admin: Model<IAdmin>,
    @inject(TYPES.Conversation) private Conversation: Model<IConversation>,
    @inject(TYPES.Message) private Message: Model<IMessage>,
    @inject(TYPES.ConversationProduct)
    private ConversationProduct: Model<IConversationProduct>,
    @inject(TYPES.MessageService) private messageService: IMessageService,
    @inject(TYPES.NotificationService) private notificationService: NotificationService
  ) {
    super();
  }

  private populatePaths() {
    return [
      { path: 'product', select: 'name images price quantityAvailable totalStock status slug' },
      { path: 'contextProduct', select: 'name images price quantityAvailable totalStock status slug' },
      { path: 'buyer', select: 'firstName lastName email' },
      { path: 'admin', select: 'firstName lastName email' },
      { path: 'seller', select: 'name logo official' },
      { path: 'sellerUser', select: 'firstName lastName email' },
      {
        path: 'activeOffer',
        select: 'amount finalPrice quantity currency status expiresAt convertedAt product',
      },
    ];
  }

  private async loadAttachedProducts(conversationId: string) {
    if (!isValidMongoId(conversationId)) {
      return [];
    }
    try {
      const rows = await this.ConversationProduct.find({
        conversation: new mongoose.Types.ObjectId(conversationId),
      })
        .populate('product', 'name images price quantityAvailable totalStock status slug')
        .sort({ attachedAt: -1 })
        .lean();
      return rows.map((r) => ({ product: (r as Record<string, unknown>).product }));
    } catch (err) {
      console.warn('loadAttachedProducts skipped:', conversationId, err);
      return [];
    }
  }

  private async serializeLoaded(
    doc: Record<string, unknown> | null,
    conversationId?: string
  ): Promise<ConversationDto> {
    if (!doc) {
      throw new AppError('Conversation not found', 404);
    }
    const id = conversationId || pickIdFromDoc(doc);
    const attached = id ? await this.loadAttachedProducts(id) : [];
    return serializeConversation(doc, { attachedProducts: attached });
  }

  async resolveSellerContext(productId: string): Promise<SellerContext> {
    const product = await this.Product.findById(productId);
    if (!product) {
      throw new AppError('Product not found', 404);
    }

    const sellerId = product.owner?.toString();
    if (!sellerId) {
      throw new AppError('Product has no seller', 400);
    }

    const seller = await this.Seller.findById(sellerId);
    if (!seller) {
      throw new AppError('Seller not found', 404);
    }

    const sellerUserId = await resolveSellerUserId(seller, this.User, this.Admin);

    return { product, seller, sellerUserId, sellerId };
  }

  async resolveSellerById(sellerId: string): Promise<{ seller: ISeller; sellerUserId: string }> {
    const seller = await this.Seller.findById(sellerId);
    if (!seller) {
      throw new AppError('Seller not found', 404);
    }
    const sellerUserId = await resolveSellerUserId(seller, this.User, this.Admin);
    return { seller, sellerUserId };
  }

  async createOrGetStoreConversation(
    sellerId: string,
    buyerId: string,
    options?: { text?: string; session?: ClientSession }
  ): Promise<ConversationDto> {
    const { seller, sellerUserId } = await this.resolveSellerById(sellerId);
    const buyer = await this.User.findById(buyerId).select('seller').lean();

    if (isSelfStoreInteraction(buyerId, sellerId, sellerUserId, buyer as IUser)) {
      throw new AppError(OWN_STORE_ERROR, 400, 'OWN_STORE');
    }

    const session = options?.session;
    let conversation = await this.Conversation.findOne({
      type: 'STORE',
      buyer: buyerId,
      seller: sellerId,
    }).session(session || null);

    if (!conversation) {
      const participants = [
        new mongoose.Types.ObjectId(buyerId),
        new mongoose.Types.ObjectId(sellerUserId),
      ];

      try {
        const created = await this.Conversation.create(
          [
            {
              type: 'STORE',
              status: 'OPEN',
              buyer: buyerId,
              seller: sellerId,
              sellerUser: sellerUserId,
              participants,
              lastMessage: '',
              lastMessageAt: new Date(),
            },
          ],
          { session }
        );
        conversation = created[0];
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) {
          conversation = await this.Conversation.findOne({
            type: 'STORE',
            buyer: buyerId,
            seller: sellerId,
          }).session(session || null);
        } else {
          throw err;
        }
      }
    }

    if (!conversation) {
      throw new AppError('Failed to create conversation', 500);
    }

    const conversationId = toIdString(conversation._id);
    const trimmedText = options?.text?.trim();
    if (trimmedText) {
      await this.messageService.sendTextMessage(
        conversationId,
        buyerId,
        sellerUserId,
        null,
        trimmedText,
        session
      );
    }

    const populated = await this.Conversation.findById(conversationId)
      .session(session || null)
      .populate(this.populatePaths())
      .lean();

    return this.serializeLoaded(populated as Record<string, unknown>, conversationId);
  }

  async attachProductToConversation(
    conversationId: string,
    productId: string,
    buyerId: string,
    options?: { session?: ClientSession; setAsContext?: boolean }
  ): Promise<void> {
    const session = options?.session;
    const conversation = await this.getConversationForUser(conversationId, buyerId);
    const { product, seller, sellerId, sellerUserId } =
      await this.resolveSellerContext(productId);
    const buyer = await this.User.findById(buyerId).select('seller').lean();
    if (isBuyerProductOwner(buyerId, product, seller, buyer as IUser)) {
      throw new AppError(OWN_STORE_ERROR, 400, 'OWN_STORE');
    }

    if (toIdString(conversation.seller) !== sellerId) {
      throw new AppError('Product does not belong to this store conversation', 400);
    }

    await this.ConversationProduct.findOneAndUpdate(
      { conversation: conversationId, product: productId },
      { $setOnInsert: { attachedAt: new Date() } },
      { upsert: true, session }
    );

    if (options?.setAsContext !== false) {
      await this.Conversation.updateOne(
        { _id: conversationId },
        { contextProduct: productId },
        { session }
      );
    }
  }

  async createOrGetConversation(
    productId: string,
    buyerId: string,
    options?: { text?: string; session?: ClientSession }
  ): Promise<ConversationDto> {
    const { product, seller, sellerId, sellerUserId } =
      await this.resolveSellerContext(productId);
    const buyer = await this.User.findById(buyerId).select('seller').lean();
    if (isBuyerProductOwner(buyerId, product, seller, buyer as IUser)) {
      throw new AppError(OWN_STORE_ERROR, 400, 'OWN_STORE');
    }

    const session = options?.session;

    // Legacy PRODUCT thread (read-only path during migration)
    const legacy = await this.Conversation.findOne({
      type: 'PRODUCT',
      product: productId,
      buyer: buyerId,
      seller: sellerId,
    }).session(session || null);

    if (legacy) {
      const conversationId = toIdString(legacy._id);
      const trimmedText = options?.text?.trim();
      if (trimmedText) {
        const sellerUserId = toIdString(legacy.sellerUser);
        await this.messageService.sendTextMessage(
          conversationId,
          buyerId,
          sellerUserId,
          productId,
          trimmedText,
          session
        );
      }
      const populated = await this.Conversation.findById(conversationId)
        .session(session || null)
        .populate(this.populatePaths())
        .lean();
      return this.serializeLoaded(populated as Record<string, unknown>, conversationId);
    }

    // Marketplace: one STORE inbox per buyer ↔ seller, product attached
    const storeConversation = await this.createOrGetStoreConversation(sellerId, buyerId, {
      session,
    });

    const conversationId = storeConversation.id;
    if (!conversationId) {
      throw new AppError('Store conversation id missing', 500);
    }

    await this.attachProductToConversation(conversationId, productId, buyerId, {
      session,
      setAsContext: true,
    });

    if (options?.text?.trim()) {
      const { sellerUserId } = await this.resolveSellerContext(productId);
      await this.messageService.sendTextMessage(
        conversationId,
        buyerId,
        sellerUserId,
        productId,
        options.text.trim(),
        session
      );
    }

    return this.getConversationDetail(conversationId, buyerId);
  }

  private assertSellerScope(
    conversation: IConversation,
    userId: string,
    sellerDocId: string
  ): void {
    if (!canAccessConversationAsSeller(conversation, userId, sellerDocId)) {
      throw new AppError('Conversation not found', 404);
    }
  }

  /** Buyer must have started the thread (message, product inquiry, or offer in chat). */
  private async buyerHasInitiatedStoreThread(conversation: IConversation): Promise<boolean> {
    if (conversation.type === 'ADMIN_SELLER') {
      return true;
    }

    const buyerId = conversation.buyer ? toIdString(conversation.buyer) : '';
    if (!buyerId) {
      return false;
    }

    return Boolean(
      await this.Message.exists(
        buildBuyerInitiatedMessageFilter(conversation._id, buyerId)
      )
    );
  }

  private async assertBuyerInitiatedStoreThread(conversation: IConversation): Promise<void> {
    if (await this.buyerHasInitiatedStoreThread(conversation)) {
      return;
    }
    throw new AppError('Conversation not found', 404);
  }

  private async getStoreConversationIdsWithBuyerMessages(
    rows: Array<Record<string, unknown>>
  ): Promise<Set<string>> {
    const storeRows = rows.filter(
      (row) => row.type === 'STORE' || row.type === 'PRODUCT'
    );
    if (storeRows.length === 0) {
      return new Set();
    }

    const conversationIds: string[] = [];
    const buyerIdByConversation = new Map<string, string>();

    for (const row of storeRows) {
      const conversationId = pickIdFromDoc(row);
      if (!conversationId) continue;

      const buyerRef = row.buyer;
      let buyerId: string | null = null;
      if (buyerRef && typeof buyerRef === 'object') {
        const buyerDoc = buyerRef as { _id?: unknown; id?: unknown };
        try {
          buyerId = toIdString(buyerDoc._id ?? buyerDoc.id ?? buyerRef);
        } catch {
          buyerId = null;
        }
      } else if (buyerRef) {
        try {
          buyerId = toIdString(buyerRef);
        } catch {
          buyerId = null;
        }
      }

      if (!buyerId) continue;
      conversationIds.push(conversationId);
      buyerIdByConversation.set(conversationId, buyerId);
    }

    if (conversationIds.length === 0) {
      return new Set();
    }

    const messages = await this.Message.find({
      conversation: { $in: conversationIds },
      type: { $nin: ['SYSTEM'] },
    })
      .select('conversation sender')
      .lean();

    const allowed = new Set<string>();
    for (const message of messages) {
      const conversationId = toIdString(message.conversation);
      const senderId = toIdString(message.sender);
      if (buyerIdByConversation.get(conversationId) === senderId) {
        allowed.add(conversationId);
      }
    }

    return allowed;
  }

  private async serializeForSeller(
    doc: Record<string, unknown>,
    conversationId: string,
    buyerInitiated: boolean
  ): Promise<ConversationDto> {
    const base = await this.serializeLoaded(doc, conversationId);
    return {
      ...base,
      buyerInitiated,
      canSellerReply: doc.type === 'ADMIN_SELLER' || buyerInitiated,
    } as ConversationDto;
  }

  async getConversationDetail(
    conversationId: string,
    userId: string,
    options?: { sellerScope?: SellerScopeOptions }
  ): Promise<ConversationDto> {
    await this.getConversationForUser(conversationId, userId, options);
    const populated = await this.Conversation.findById(conversationId)
      .populate(this.populatePaths())
      .lean();
    return this.serializeLoaded(populated as Record<string, unknown>, conversationId);
  }

  async getSellerConversations(userId: string, sellerDocId: string): Promise<ConversationDto[]> {
    const rows = await this.Conversation.find(buildSellerConversationFilter(userId, sellerDocId))
      .populate(this.populatePaths())
      .sort({ lastMessageAt: -1 })
      .lean();

    const typedRows = rows as Record<string, unknown>[];
    const buyerInitiatedStoreIds = await this.getStoreConversationIdsWithBuyerMessages(typedRows);

    const result: ConversationDto[] = [];
    for (const row of typedRows) {
      const id = pickIdFromDoc(row);
      if (!id) continue;

      const isAdminThread = row.type === 'ADMIN_SELLER';
      const isBuyerInitiatedStore =
        row.type === 'STORE' || row.type === 'PRODUCT'
          ? buyerInitiatedStoreIds.has(id)
          : false;

      if (!isAdminThread && !isBuyerInitiatedStore) {
        continue;
      }

      try {
        result.push(
          await this.serializeForSeller(row, id, isAdminThread || isBuyerInitiatedStore)
        );
      } catch (err) {
        console.warn('Skipping conversation in seller list:', id, err);
      }
    }
    return result;
  }

  async getUserConversations(userId: string): Promise<ConversationDto[]> {
    const user = await this.User.findById(userId).select('seller').lean();
    const query: Record<string, unknown> = { participants: userId };
    if (!user?.seller) {
      query.type = { $ne: 'ADMIN_SELLER' };
    }

    const rows = await this.Conversation.find(query)
      .populate(this.populatePaths())
      .sort({ lastMessageAt: -1 })
      .lean();

    const result: ConversationDto[] = [];
    for (const row of rows as Record<string, unknown>[]) {
      const id = pickIdFromDoc(row);
      if (!id) continue;
      try {
        result.push(await this.serializeLoaded(row, id));
      } catch (err) {
        console.warn('Skipping conversation in list:', id, err);
      }
    }
    return result;
  }

  async getConversationForUser(
    conversationId: string,
    userId: string,
    options?: { sellerScope?: SellerScopeOptions }
  ): Promise<IConversation> {
    const conversation = await this.Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    if (options?.sellerScope) {
      this.assertSellerScope(conversation, userId, options.sellerScope.sellerDocId);
      await this.assertBuyerInitiatedStoreThread(conversation);
    }

    return conversation;
  }

  async closeConversation(conversationId: string, userId: string): Promise<ConversationDto> {
    const conversation = await this.getConversationForUser(conversationId, userId);
    const sellerUserId = toIdString(conversation.sellerUser);
    const buyerId = conversation.buyer ? toIdString(conversation.buyer) : '';
    if (userId !== sellerUserId && userId !== buyerId) {
      throw new AppError('Unauthorized', 403);
    }

    await this.Conversation.updateOne({ _id: conversationId }, { status: 'CLOSED' });
    return this.getConversationDetail(conversationId, userId);
  }

  async incrementUnread(
    conversationId: string,
    forRole: 'buyer' | 'seller',
    session?: ClientSession
  ): Promise<void> {
    const field = forRole === 'buyer' ? 'unreadByBuyer' : 'unreadBySeller';
    await this.Conversation.updateOne(
      { _id: conversationId },
      { $inc: { [field]: 1 } },
      { session }
    );
  }

  async updateConversationPreview(
    conversationId: string,
    text: string,
    session?: ClientSession
  ): Promise<void> {
    await this.Conversation.updateOne(
      { _id: conversationId },
      { lastMessage: text, lastMessageAt: new Date() },
      { session }
    );
  }

  async markConversationRead(
    conversationId: string,
    userId: string,
    options?: { sellerScope?: SellerScopeOptions }
  ): Promise<ConversationDto> {
    const conversation = await this.getConversationForUser(conversationId, userId, options);
    const update: Record<string, number> = {};

    if (conversation.type === 'ADMIN_SELLER') {
      const sellerUserId = toIdString(conversation.sellerUser);
      if (userId === sellerUserId) {
        update.unreadBySeller = 0;
      } else {
        update.unreadByAdmin = 0;
      }
    } else {
      const isBuyer = conversation.buyer && toIdString(conversation.buyer) === userId;
      if (isBuyer) {
        update.unreadByBuyer = 0;
      } else {
        update.unreadBySeller = 0;
      }
    }

    await this.Conversation.updateOne({ _id: conversationId }, update);
    await this.messageService.markMessagesRead(conversationId, userId);
    await this.notificationService.markConversationNotificationsAsRead(userId, conversationId);

    return this.getConversationDetail(conversationId, userId, options);
  }

  async createOrGetAdminSellerConversation(
    admin: IAdmin,
    sellerId: string,
    options?: { text?: string; session?: ClientSession }
  ): Promise<ConversationDto> {
    const adminId = toIdString(admin._id);
    const adminChatUserId = await resolveAdminChatUserId(admin, this.User);
    const { seller, sellerUserId } = await this.resolveSellerById(sellerId);

    const session = options?.session;
    let conversation = await this.Conversation.findOne({
      type: 'ADMIN_SELLER',
      admin: adminId,
      seller: sellerId,
    }).session(session || null);

    if (!conversation) {
      const participants = [
        new mongoose.Types.ObjectId(adminChatUserId),
        new mongoose.Types.ObjectId(sellerUserId),
      ];

      try {
        const created = await this.Conversation.create(
          [
            {
              type: 'ADMIN_SELLER',
              status: 'OPEN',
              admin: adminId,
              seller: sellerId,
              sellerUser: sellerUserId,
              participants,
              lastMessage: '',
              lastMessageAt: new Date(),
            },
          ],
          { session }
        );
        conversation = created[0];
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) {
          conversation = await this.Conversation.findOne({
            type: 'ADMIN_SELLER',
            admin: adminId,
            seller: sellerId,
          }).session(session || null);
        } else {
          throw err;
        }
      }
    }

    if (!conversation) {
      throw new AppError('Failed to create admin conversation', 500);
    }

    const conversationId = toIdString(conversation._id);
    const trimmedText = options?.text?.trim();
    if (trimmedText) {
      await this.messageService.sendTextMessage(
        conversationId,
        adminChatUserId,
        sellerUserId,
        null,
        trimmedText,
        session
      );
    }

    const populated = await this.Conversation.findById(conversationId)
      .session(session || null)
      .populate(this.populatePaths())
      .lean();

    return this.serializeLoaded(populated as Record<string, unknown>, conversationId);
  }

  async openAdminSupportForSeller(
    sellerDocId: string,
    options?: { text?: string }
  ): Promise<ConversationDto> {
    const admin = await this.Admin.findOne({ isActive: true }).sort({ createdAt: 1 });
    if (!admin) {
      throw new AppError('Platform support is temporarily unavailable', 503);
    }

    return this.createOrGetAdminSellerConversation(admin, sellerDocId, {
      text: options?.text,
    });
  }

  async getAdminSellerConversations(adminId: string): Promise<ConversationDto[]> {
    const rows = await this.Conversation.find({ type: 'ADMIN_SELLER', admin: adminId })
      .populate(this.populatePaths())
      .sort({ lastMessageAt: -1 })
      .lean();

    const result: ConversationDto[] = [];
    for (const row of rows as Record<string, unknown>[]) {
      const id = pickIdFromDoc(row);
      if (!id) continue;
      result.push(await this.serializeLoaded(row, id));
    }
    return result;
  }

  async getConversationDetailForAdmin(
    conversationId: string,
    adminChatUserId: string
  ): Promise<ConversationDto> {
    const conversation = await this.Conversation.findOne({
      _id: conversationId,
      type: 'ADMIN_SELLER',
      participants: adminChatUserId,
    });
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }
    const populated = await this.Conversation.findById(conversationId)
      .populate(this.populatePaths())
      .lean();
    return this.serializeLoaded(populated as Record<string, unknown>, conversationId);
  }

  async markConversationReadForAdmin(
    conversationId: string,
    adminChatUserId: string
  ): Promise<ConversationDto> {
    await this.getConversationDetailForAdmin(conversationId, adminChatUserId);
    await this.Conversation.updateOne(
      { _id: conversationId },
      { unreadByAdmin: 0 }
    );
    await this.messageService.markMessagesRead(conversationId, adminChatUserId);
    return this.getConversationDetailForAdmin(conversationId, adminChatUserId);
  }
}

function pickIdFromDoc(doc: Record<string, unknown>): string | null {
  try {
    return toIdString(doc._id ?? doc.id);
  } catch {
    return null;
  }
}
