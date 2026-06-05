import { inject, injectable } from 'inversify';
import mongoose, { Model, PipelineStage } from 'mongoose';
import TYPES from '../di';
import { IConversation, IOffer, IProduct, ISeller, IUser } from '../models';
import AppError from '../utils/errors/AppError';
import {
  ACCEPTED_OFFER_TTL_MS,
  OFFER_COOLDOWN_MS,
  getOfferBanMessage,
  isBuyerProductOwner,
  OWN_STORE_ERROR,
  isOfferInCooldown,
  isUserOfferBanned,
  validateOfferAmount,
} from '../utils/offerRules';
import { BaseService } from './BaseService';
import { IConversationService } from './ConversationService';
import { IMessageService } from './MessageService';
import { ICartService } from './CartService';
import { NotificationService } from './NotificationService';
import { toIdString } from '../utils/mongoId';
import { canUserAccessOffer } from '../utils/sellerAccess';
import { ProductAvailabilityService } from './ProductAvailabilityService';
import { runInTransactionWithRetry } from '../utils/mongoRetry';

export interface IOfferService {
  createOffer(
    productId: string,
    buyerId: string,
    amount: number,
    message?: string,
    options?: { quantity?: number; currency?: string }
  ): Promise<{ offer: IOffer; conversation: IConversation }>;
  counterOffer(
    offerId: string,
    actorUserId: string,
    amount: number,
    message?: string,
    options?: { quantity?: number; currency?: string }
  ): Promise<{ offer: IOffer; previousOffer: IOffer }>;
  acceptOffer(offerId: string, actorUserId: string): Promise<IOffer>;
  rejectOffer(offerId: string, actorUserId: string, reason?: string): Promise<IOffer>;
  getOfferById(offerId: string): Promise<IOffer | null>;
  getOfferForUser(offerId: string, actorUserId: string): Promise<IOffer>;
  countSellerPendingOffers(sellerId: string): Promise<number>;
  getBuyerOffers(
    buyerId: string,
    status?: string,
    page?: number,
    limit?: number
  ): Promise<{ offers: IOffer[]; total: number; page: number; totalPages: number }>;
  getSellerOffers(
    sellerId: string,
    status?: string,
    page?: number,
    limit?: number
  ): Promise<{ offers: IOffer[]; total: number; page: number; totalPages: number }>;
  addAcceptedOfferToCart(
    offerId: string,
    buyerId: string,
    size?: string,
    color?: string
  ): Promise<unknown>;
  expireOfferIfNeeded(offer: IOffer): Promise<IOffer>;
  cancelOffer(offerId: string, reason: string, actorUserId: string): Promise<IOffer>;
  getAllOffersForAdmin(
    filters: Record<string, unknown>,
    page: number,
    limit: number,
    search?: string
  ): Promise<{ offers: IOffer[]; total: number; page: number; totalPages: number }>;
  getOfferStatistics(): Promise<Record<string, unknown>>;
  getOfferAnalytics(period: string, dateFrom?: string, dateTo?: string): Promise<unknown[]>;
  getProductsWithOffers(
    filters: { search?: string },
    page: number,
    limit: number
  ): Promise<{ products: unknown[]; total: number; page: number; totalPages: number }>;
  getProductOffersForAdmin(productId: string): Promise<Record<string, unknown>>;
}

@injectable()
export class OfferService extends BaseService implements IOfferService {
  constructor(
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.Seller) private Seller: Model<ISeller>,
    @inject(TYPES.Offer) private Offer: Model<IOffer>,
    @inject(TYPES.Conversation) private Conversation: Model<IConversation>,
    @inject(TYPES.ConversationService) private conversationService: IConversationService,
    @inject(TYPES.MessageService) private messageService: IMessageService,
    @inject(TYPES.CartService) private cartService: ICartService,
    @inject(TYPES.NotificationService) private notificationService: NotificationService,
    @inject(TYPES.ProductAvailabilityService)
    private productAvailability: ProductAvailabilityService
  ) {
    super();
  }

  private async loadBuyer(buyerId: string): Promise<IUser> {
    return this.verifyDoc(buyerId, this.User);
  }

  private async assertCanCreateOffer(productId: string, buyerId: string, amount: number) {
    const buyer = await this.loadBuyer(buyerId);
    if (isUserOfferBanned(buyer)) {
      throw new AppError(getOfferBanMessage(buyer), 403);
    }

    const { product, seller, sellerUserId } =
      await this.conversationService.resolveSellerContext(productId);

    await this.productAvailability.assertOfferable(productId);

    if (isBuyerProductOwner(buyerId, product, seller, buyer)) {
      throw new AppError(OWN_STORE_ERROR, 400, 'OWN_STORE');
    }

    const amountCheck = validateOfferAmount(product, amount);
    if (!amountCheck.valid) {
      throw new AppError(amountCheck.message || 'Invalid offer amount', 400);
    }

    const pendingOffer = await this.Offer.findOne({
      product: productId,
      buyer: buyerId,
      status: 'PENDING',
    });
    if (pendingOffer) {
      throw new AppError('You already have a pending offer on this product', 409);
    }

    const recentRejected = await this.Offer.findOne({
      product: productId,
      buyer: buyerId,
      status: 'REJECTED',
      cooldownUntil: { $gt: new Date() },
    }).sort({ rejectedAt: -1 });

    if (recentRejected && isOfferInCooldown(recentRejected)) {
      throw new AppError(
        'You must wait 12 hours after a rejected offer before making a new offer on this product',
        400
      );
    }

    return {
      product,
      seller,
      sellerUserId,
      sellerId: toIdString(seller),
    };
  }

  async createOffer(
    productId: string,
    buyerId: string,
    amount: number,
    message?: string,
    options?: { quantity?: number; currency?: string }
  ): Promise<{ offer: IOffer; conversation: IConversation }> {
    const { sellerUserId, sellerId } = await this.assertCanCreateOffer(
      productId,
      buyerId,
      amount
    );

    const { offer, conversationId } = await runInTransactionWithRetry(async (session) => {
      const conversation = await this.conversationService.createOrGetConversation(
        productId,
        buyerId,
        { session }
      );

      const quantity = Math.max(1, options?.quantity ?? 1);
      const currency = (options?.currency || 'USD').toUpperCase();

      const offer = (
        await this.Offer.create(
          [
            {
              conversation: toIdString(conversation),
              product: productId,
              buyer: buyerId,
              seller: sellerId,
              sellerUser: sellerUserId,
              amount,
              quantity,
              currency,
              initiatedBy: 'BUYER',
              status: 'PENDING',
            },
          ],
          { session }
        )
      )[0];

      const conversationId = conversation.id;
      if (!conversationId) {
        throw new AppError('Conversation id missing after create', 500);
      }

      // createOrGetConversation already attaches product; only set active offer here.
      await this.Conversation.updateOne(
        { _id: conversationId },
        {
          hasActiveOffer: true,
          activeOffer: offer._id,
          contextProduct: productId,
        },
        { session }
      );

      await this.messageService.createTypedMessage({
        conversationId: toIdString(conversation),
        senderId: buyerId,
        recipientId: sellerUserId,
        productId,
        offerId: toIdString(offer),
        type: 'OFFER_CREATED',
        text: `Offer: ${currency} ${amount.toFixed(2)}${quantity > 1 ? ` × ${quantity}` : ''}`,
        session,
      });

      if (message?.trim()) {
        await this.messageService.sendTextMessage(
          toIdString(conversation),
          buyerId,
          sellerUserId,
          productId,
          message.trim(),
          session
        );
      }

      return { offer, conversationId };
    });

    try {
      const productDoc = await this.Product.findById(productId).select('name').lean();
      const buyer = await this.User.findById(buyerId).select('firstName lastName').lean();
      const buyerName = buyer
        ? `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || 'A buyer'
        : 'A buyer';
      await this.notificationService.notifyOfferCreatedToSeller({
        sellerUserId,
        buyerName,
        productName: productDoc?.name || 'Product',
        amount,
        offerId: toIdString(offer),
        productId,
        conversationId: toIdString(conversationId),
      });
    } catch {
      // non-blocking
    }

    const populatedOffer = await this.getOfferById(toIdString(offer));
    const populatedConversation = await this.Conversation.findById(conversationId)
      .populate('product', 'name images price')
      .populate('buyer', 'firstName lastName email')
      .populate('seller', 'name')
      .populate('sellerUser', 'firstName lastName email')
      .populate('activeOffer', 'amount status expiresAt convertedAt');

    return {
      offer: populatedOffer!,
      conversation: populatedConversation!,
    };
  }

  private async getOfferForAction(offerId: string): Promise<IOffer> {
    const offer = await this.Offer.findById(offerId).populate('product', 'name');
    if (!offer) {
      throw new AppError('Offer not found', 404);
    }
    return offer;
  }

  private assertPending(offer: IOffer): void {
    if (offer.status !== 'PENDING') {
      throw new AppError('Only pending offers can be updated', 400);
    }
  }

  private async assertOfferSeller(offer: IOffer, actorUserId: string): Promise<void> {
    const sellerUserId = toIdString(offer.sellerUser);
    const seller = await this.Seller.findById(offer.seller);
    const sellerDocUserId = seller?.user ? toIdString(seller.user) : '';

    if (actorUserId !== sellerUserId && actorUserId !== sellerDocUserId) {
      throw new AppError('Unauthorized to manage this offer', 403);
    }
  }

  async expireOfferIfNeeded(offer: IOffer): Promise<IOffer> {
    if (
      offer.status === 'ACCEPTED' &&
      offer.expiresAt &&
      offer.expiresAt < new Date()
    ) {
      offer.status = 'EXPIRED';
      await offer.save();
    }
    return offer;
  }

  async counterOffer(
    offerId: string,
    actorUserId: string,
    amount: number,
    message?: string,
    options?: { quantity?: number; currency?: string }
  ): Promise<{ offer: IOffer; previousOffer: IOffer }> {
    const previous = await this.getOfferForAction(offerId);
    this.assertPending(previous);
    await this.assertOfferSeller(previous, actorUserId);

    const productId = toIdString(previous.product);
    const buyerId = toIdString(previous.buyer);
    const sellerId = toIdString(previous.seller);
    const sellerUserId = toIdString(previous.sellerUser);
    const quantity = Math.max(1, options?.quantity ?? previous.quantity ?? 1);
    const currency = (options?.currency || previous.currency || 'USD').toUpperCase();

    const productDoc =
      previous.product && typeof previous.product === 'object'
        ? (previous.product as IProduct)
        : await this.Product.findById(productId);
    if (!productDoc) {
      throw new AppError('Product not found', 404);
    }
    const amountCheck = validateOfferAmount(productDoc, amount);
    if (!amountCheck.valid) {
      throw new AppError(amountCheck.message || 'Invalid counter offer amount', 400);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      previous.status = 'REJECTED';
      previous.rejectedAt = new Date();
      await previous.save({ session });

      const counter = (
        await this.Offer.create(
          [
            {
              conversation: previous.conversation,
              product: productId,
              buyer: buyerId,
              seller: sellerId,
              sellerUser: sellerUserId,
              amount,
              quantity,
              currency,
              initiatedBy: 'SELLER',
              parentOffer: previous._id,
              status: 'PENDING',
            },
          ],
          { session }
        )
      )[0];

      await this.Conversation.updateOne(
        { _id: previous.conversation },
        { hasActiveOffer: true, activeOffer: counter._id },
        { session }
      );

      const counterText = `Counter offer: ${currency} ${amount.toFixed(2)}${quantity > 1 ? ` × ${quantity}` : ''}`;
      await this.messageService.createTypedMessage({
        conversationId: toIdString(previous.conversation),
        senderId: sellerUserId,
        recipientId: buyerId,
        productId,
        offerId: toIdString(counter),
        type: 'OFFER_COUNTER',
        text: message?.trim() || counterText,
        session,
      });

      await session.commitTransaction();

      try {
        const productName =
          (productDoc as IProduct)?.name ||
          (previous.product as IProduct)?.name ||
          'Product';
        await this.notificationService.notifyCounterOfferToBuyer({
          buyerId,
          productName,
          productId,
          offerId: toIdString(counter),
          conversationId: toIdString(previous.conversation),
          amount,
        });
      } catch {
        // non-blocking
      }

      return {
        offer: (await this.getOfferById(toIdString(counter)))!,
        previousOffer: (await this.getOfferById(offerId))!,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async acceptOffer(offerId: string, actorUserId: string): Promise<IOffer> {
    let offer = await this.getOfferForAction(offerId);
    this.assertPending(offer);

    const buyerId = toIdString(offer.buyer);
    const initiatedBy = offer.initiatedBy || 'BUYER';

    if (initiatedBy === 'SELLER') {
      if (actorUserId !== buyerId) {
        throw new AppError('Only the buyer can accept a seller counter-offer', 403);
      }
    } else {
      await this.assertOfferSeller(offer, actorUserId);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const expiresAt = new Date(Date.now() + ACCEPTED_OFFER_TTL_MS);
      offer.status = 'ACCEPTED';
      offer.acceptedAt = new Date();
      offer.finalPrice = offer.amount;
      offer.expiresAt = expiresAt;
      offer.checkoutReservedUntil = expiresAt;
      await offer.save({ session });

      await this.Conversation.updateOne(
        { _id: offer.conversation },
        { hasActiveOffer: true, activeOffer: toIdString(offer) },
        { session }
      );

      const buyerId = toIdString(offer.buyer);
      const sellerUserId = toIdString(offer.sellerUser);
      const productId = toIdString(offer.product);

      await this.messageService.createTypedMessage({
        conversationId: toIdString(offer.conversation),
        senderId: sellerUserId,
        recipientId: buyerId,
        productId,
        offerId: toIdString(offer),
        type: 'OFFER_ACCEPTED',
        text: `Your offer of $${offer.amount.toFixed(2)} has been accepted. You have 24 hours to add it to your cart.`,
        session,
      });

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    try {
      const productName = (offer.product as IProduct)?.name || 'Product';
      await this.notificationService.notifyOfferAcceptedToBuyer({
        buyerId: toIdString(offer.buyer),
        productName,
        productId: toIdString(offer.product),
        offerId: toIdString(offer),
        conversationId: toIdString(offer.conversation),
        amount: offer.amount,
      });
    } catch {
      // non-blocking
    }

    return (await this.getOfferById(offerId))!;
  }

  async rejectOffer(
    offerId: string,
    actorUserId: string,
    reason?: string
  ): Promise<IOffer> {
    let offer = await this.getOfferForAction(offerId);
    this.assertPending(offer);

    const buyerId = toIdString(offer.buyer);
    const initiatedBy = offer.initiatedBy || 'BUYER';

    if (initiatedBy === 'SELLER') {
      if (actorUserId !== buyerId) {
        throw new AppError('Only the buyer can reject a seller counter-offer', 403);
      }
    } else {
      await this.assertOfferSeller(offer, actorUserId);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const cooldownUntil = new Date(Date.now() + OFFER_COOLDOWN_MS);
      offer.status = 'REJECTED';
      offer.rejectedAt = new Date();
      offer.cooldownUntil = cooldownUntil;
      await offer.save({ session });

      await this.Conversation.updateOne(
        { _id: offer.conversation },
        { hasActiveOffer: false, activeOffer: null },
        { session }
      );

      const buyerId = toIdString(offer.buyer);
      const sellerUserId = toIdString(offer.sellerUser);
      const rejectionText =
        reason?.trim() || `Your offer of $${offer.amount.toFixed(2)} was not accepted.`;

      await this.messageService.createTypedMessage({
        conversationId: toIdString(offer.conversation),
        senderId: sellerUserId,
        recipientId: buyerId,
        productId: toIdString(offer.product),
        offerId: toIdString(offer),
        type: 'OFFER_REJECTED',
        text: rejectionText,
        session,
      });

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    try {
      const productName = (offer.product as IProduct)?.name || 'Product';
      await this.notificationService.notifyOfferRejectedToBuyer({
        buyerId: toIdString(offer.buyer),
        productName,
        productId: toIdString(offer.product),
        offerId: toIdString(offer),
        conversationId: toIdString(offer.conversation),
      });
    } catch {
      // non-blocking
    }

    return (await this.getOfferById(offerId))!;
  }

  async getOfferById(offerId: string): Promise<IOffer | null> {
    const offer = await this.Offer.findById(offerId)
      .populate('buyer', 'firstName lastName email')
      .populate('seller', 'name')
      .populate('sellerUser', 'firstName lastName email')
      .populate('product', 'name images price')
      .populate('conversation');

    if (offer) {
      await this.expireOfferIfNeeded(offer);
    }

    return offer;
  }

  async getOfferForUser(offerId: string, actorUserId: string): Promise<IOffer> {
    const offer = await this.getOfferById(offerId);
    if (!offer) {
      throw new AppError('Offer not found', 404);
    }

    const seller = await this.Seller.findById(offer.seller).select('user').lean();
    const sellerDocUserId = seller?.user ? toIdString(seller.user) : '';

    if (!canUserAccessOffer(offer, actorUserId, sellerDocUserId)) {
      throw new AppError('Offer not found', 404);
    }

    return offer;
  }

  async countSellerPendingOffers(sellerId: string): Promise<number> {
    return this.Offer.countDocuments({ seller: sellerId, status: 'PENDING' });
  }

  async getBuyerOffers(
    buyerId: string,
    status?: string,
    page = 1,
    limit = 10
  ): Promise<{ offers: IOffer[]; total: number; page: number; totalPages: number }> {
    const filter: Record<string, unknown> = { buyer: buyerId };
    if (status) filter.status = status.toUpperCase();

    const skip = (page - 1) * limit;
    const total = await this.Offer.countDocuments(filter);
    const offers = await this.Offer.find(filter)
      .populate('product', 'name images image price newPrice computedPrice')
      .populate('seller', 'name storeName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return { offers: offers as unknown as IOffer[], total, page, totalPages: Math.ceil(total / limit) };
  }

  async getSellerOffers(
    sellerId: string,
    status?: string,
    page = 1,
    limit = 10
  ): Promise<{ offers: IOffer[]; total: number; page: number; totalPages: number }> {
    const filter: Record<string, unknown> = { seller: sellerId };
    if (status) filter.status = status.toUpperCase();

    const skip = (page - 1) * limit;
    const total = await this.Offer.countDocuments(filter);
    const offers = await this.Offer.find(filter)
      .populate('buyer', 'firstName lastName email')
      .populate('product', 'name images price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return { offers, total, page, totalPages: Math.ceil(total / limit) };
  }

  async addAcceptedOfferToCart(
    offerId: string,
    buyerId: string,
    size = '',
    color = ''
  ): Promise<unknown> {
    let offer = await this.getOfferForAction(offerId);
    offer = await this.expireOfferIfNeeded(offer);

    if (toIdString(offer.buyer) !== buyerId) {
      throw new AppError('You can only add your own offers to cart', 403);
    }

    if (offer.status === 'CONVERTED') {
      throw new AppError('This offer has already been added to cart', 409);
    }

    if (offer.status !== 'ACCEPTED') {
      throw new AppError('Only accepted offers can be added to cart', 400);
    }

    if (offer.expiresAt && offer.expiresAt < new Date()) {
      offer.status = 'EXPIRED';
      await offer.save();
      throw new AppError('This offer has expired', 410);
    }

    const cart = await this.cartService.addOfferToCart(
      buyerId,
      toIdString(offer.product),
      offer.amount,
      size,
      color,
      offerId
    );

    offer.status = 'CONVERTED';
    offer.convertedAt = new Date();
    await offer.save();

    await this.Conversation.updateOne(
      { _id: offer.conversation },
      { hasActiveOffer: false, activeOffer: null }
    );

    return cart;
  }

  async cancelOffer(offerId: string, reason: string, actorUserId: string): Promise<IOffer> {
    const offer = await this.getOfferForAction(offerId);

    if (offer.status === 'CANCELLED' || offer.status === 'CONVERTED') {
      throw new AppError(`Cannot cancel offer with status ${offer.status}`, 400);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      offer.status = 'CANCELLED';
      offer.cancelledAt = new Date();
      await offer.save({ session });

      await this.Conversation.updateOne(
        { _id: offer.conversation },
        { hasActiveOffer: false, activeOffer: null },
        { session }
      );

      await this.messageService.createTypedMessage({
        conversationId: toIdString(offer.conversation),
        senderId: actorUserId,
        recipientId: toIdString(offer.buyer),
        productId: toIdString(offer.product),
        offerId: toIdString(offer),
        type: 'OFFER_CANCELLED',
        text: `This offer was cancelled. Reason: ${reason}`,
        session,
      });

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    return (await this.getOfferById(offerId))!;
  }

  async getAllOffersForAdmin(
    filters: Record<string, unknown>,
    page: number,
    limit: number,
    search?: string
  ): Promise<{ offers: IOffer[]; total: number; page: number; totalPages: number }> {
    const query: Record<string, unknown> = { ...filters };

    if (search) {
      const searchProducts = await this.Product.find({
        name: { $regex: search, $options: 'i' },
      }).select('_id');

      const searchUsers = await this.User.find({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
        ],
      }).select('_id');

      const searchSellers = await this.Seller.find({
        user: { $in: searchUsers.map((u) => u._id) },
      }).select('_id');

      query.$or = [
        { product: { $in: searchProducts.map((p) => p._id) } },
        { buyer: { $in: searchUsers.map((u) => u._id) } },
        { sellerUser: { $in: searchUsers.map((u) => u._id) } },
        { seller: { $in: searchSellers.map((s) => s._id) } },
      ];
    }

    const total = await this.Offer.countDocuments(query);
    const skip = (page - 1) * limit;

    const offers = await this.Offer.find(query)
      .populate('buyer', 'firstName lastName email')
      .populate('seller', 'name')
      .populate('sellerUser', 'firstName lastName email')
      .populate('product', 'name images price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return { offers, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getOfferStatistics(): Promise<Record<string, unknown>> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalOffers,
      pendingOffers,
      acceptedOffers,
      rejectedOffers,
      convertedOffers,
      todayOffers,
      weekOffers,
      monthOffers,
      avgOfferAmount,
      topProducts,
      totalProducts,
    ] = await Promise.all([
      this.Offer.countDocuments(),
      this.Offer.countDocuments({ status: 'PENDING' }),
      this.Offer.countDocuments({ status: 'ACCEPTED' }),
      this.Offer.countDocuments({ status: 'REJECTED' }),
      this.Offer.countDocuments({ status: 'CONVERTED' }),
      this.Offer.countDocuments({ createdAt: { $gte: startOfDay } }),
      this.Offer.countDocuments({ createdAt: { $gte: startOfWeek } }),
      this.Offer.countDocuments({ createdAt: { $gte: startOfMonth } }),
      this.Offer.aggregate([{ $group: { _id: null, avg: { $avg: '$amount' } } }]),
      this.Offer.aggregate([
        { $group: { _id: '$product', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: '$product' },
        {
          $project: {
            productName: '$product.name',
            offerCount: '$count',
          },
        },
      ]),
      this.Offer.aggregate([{ $group: { _id: '$product' } }, { $count: 'totalProducts' }]),
    ]);

    return {
      totalProducts: totalProducts[0]?.totalProducts || 0,
      totalOffers,
      pendingOffers,
      acceptedOffers,
      rejectedOffers,
      convertedOffers,
      todayOffers,
      weekOffers,
      monthOffers,
      avgOfferAmount: avgOfferAmount[0]?.avg || 0,
      topProducts,
      acceptanceRate:
        totalOffers > 0 ? ((acceptedOffers / totalOffers) * 100).toFixed(2) : '0',
    };
  }

  async getOfferAnalytics(
    period: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<unknown[]> {
    const matchStage: Record<string, unknown> = {};

    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) (matchStage.createdAt as Record<string, Date>).$gte = new Date(dateFrom);
      if (dateTo) (matchStage.createdAt as Record<string, Date>).$lte = new Date(dateTo);
    }

    let groupStage: Record<string, unknown>;

    switch (period) {
      case 'daily':
        groupStage = {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            totalOffers: { $sum: 1 },
            acceptedOffers: {
              $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] },
            },
            rejectedOffers: {
              $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] },
            },
            avgOfferAmount: { $avg: '$amount' },
          },
        };
        break;
      case 'weekly':
        groupStage = {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              week: { $week: '$createdAt' },
            },
            totalOffers: { $sum: 1 },
            acceptedOffers: {
              $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] },
            },
            rejectedOffers: {
              $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] },
            },
            avgOfferAmount: { $avg: '$amount' },
          },
        };
        break;
      case 'monthly':
        groupStage = {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            totalOffers: { $sum: 1 },
            acceptedOffers: {
              $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] },
            },
            rejectedOffers: {
              $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] },
            },
            avgOfferAmount: { $avg: '$amount' },
          },
        };
        break;
      default:
        throw new AppError('Invalid period. Use daily, weekly, or monthly', 400);
    }

    return this.Offer.aggregate([
      { $match: matchStage },
      groupStage,
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
    ] as unknown as PipelineStage[]);
  }

  async getProductsWithOffers(
    filters: { search?: string },
    page: number,
    limit: number
  ): Promise<{ products: unknown[]; total: number; page: number; totalPages: number }> {
    const { search } = filters;

    const pipeline: PipelineStage[] = [
      {
        $lookup: {
          from: 'offers',
          localField: '_id',
          foreignField: 'product',
          as: 'offers',
        },
      },
      { $match: { 'offers.0': { $exists: true } } },
      {
        $lookup: {
          from: 'sellers',
          localField: 'owner',
          foreignField: '_id',
          as: 'seller',
        },
      },
      { $unwind: '$seller' },
      {
        $lookup: {
          from: 'users',
          localField: 'seller.user',
          foreignField: '_id',
          as: 'sellerUser',
        },
      },
      { $unwind: '$sellerUser' },
    ];

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { 'sellerUser.firstName': { $regex: search, $options: 'i' } },
            { 'sellerUser.lastName': { $regex: search, $options: 'i' } },
            { 'sellerUser.email': { $regex: search, $options: 'i' } },
            { 'seller.name': { $regex: search, $options: 'i' } },
          ],
        },
      });
    }

    pipeline.push(
      {
        $addFields: {
          offerCount: { $size: '$offers' },
          pendingOffers: {
            $size: {
              $filter: {
                input: '$offers',
                cond: { $eq: ['$$this.status', 'PENDING'] },
              },
            },
          },
          acceptedOffers: {
            $size: {
              $filter: {
                input: '$offers',
                cond: { $eq: ['$$this.status', 'ACCEPTED'] },
              },
            },
          },
          highestOffer: { $max: '$offers.amount' },
          lowestOffer: { $min: '$offers.amount' },
          avgOfferAmount: { $avg: '$offers.amount' },
          latestOfferDate: { $max: '$offers.createdAt' },
        },
      },
      {
        $project: {
          id: '$_id',
          name: 1,
          price: 1,
          images: 1,
          seller: {
            _id: '$sellerUser._id',
            firstName: '$sellerUser.firstName',
            lastName: '$sellerUser.lastName',
            email: '$sellerUser.email',
          },
          offerCount: 1,
          pendingOffers: 1,
          acceptedOffers: 1,
          highestOffer: 1,
          lowestOffer: 1,
          avgOfferAmount: 1,
          latestOfferDate: 1,
        },
      },
      { $sort: { latestOfferDate: -1 } }
    );

    const countPipeline: PipelineStage[] = [...pipeline, { $count: 'total' }];
    const countResult = await this.Product.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    pipeline.push({ $skip: skip }, { $limit: limit });
    const products = await this.Product.aggregate(pipeline);

    return { products, total, page, totalPages };
  }

  async getProductOffersForAdmin(productId: string): Promise<Record<string, unknown>> {
    const product = await this.Product.findById(productId).populate({
      path: 'owner',
      populate: { path: 'user', select: 'firstName lastName email' },
    });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    const offers = await this.Offer.find({ product: productId })
      .populate('buyer', 'firstName lastName email')
      .sort({ createdAt: -1 });

    const amounts = offers.map((o) => o.amount);
    const owner = product.owner as ISeller & {
      user?: { firstName?: string; lastName?: string; email?: string; _id?: unknown };
    };
    const sellerUser = owner?.user;

    return {
      product: {
        id: product._id,
        name: product.name,
        price: product.price,
        images: product.images,
        seller: sellerUser
          ? {
              _id: sellerUser._id,
              firstName: sellerUser.firstName,
              lastName: sellerUser.lastName,
              email: sellerUser.email,
            }
          : null,
      },
      offers: offers.map((offer) => ({
        id: offer._id,
        buyer: offer.buyer,
        amount: offer.amount,
        status: offer.status,
        createdAt: offer.createdAt,
        updatedAt: offer.updatedAt,
        expiresAt: offer.expiresAt,
        conversation: offer.conversation,
      })),
      statistics: {
        totalOffers: offers.length,
        pendingOffers: offers.filter((o) => o.status === 'PENDING').length,
        acceptedOffers: offers.filter((o) => o.status === 'ACCEPTED').length,
        rejectedOffers: offers.filter((o) => o.status === 'REJECTED').length,
        highestOffer: amounts.length ? Math.max(...amounts) : 0,
        lowestOffer: amounts.length ? Math.min(...amounts) : 0,
        avgOfferAmount: amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0,
      },
    };
  }
}
