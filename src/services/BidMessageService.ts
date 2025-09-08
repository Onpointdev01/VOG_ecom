import { inject, injectable } from 'inversify';
import TYPES from '../di';
import { IBidMessages, IUser } from '../models';
import { Model } from 'mongoose';
import { BaseService } from './BaseService';
// [SSE] add import
import { streamController } from '../realtime/streamController';

export interface IBidMessageService {
  createBidProposalMessage(senderId: string, recipientId: string, productId: string, bidId: string, message: string): Promise<IBidMessages>;
  createBidAcceptedMessage(senderId: string, recipientId: string, productId: string, bidId: string, message: string): Promise<IBidMessages>;
  createBidRejectedMessage(senderId: string, recipientId: string, productId: string, bidId: string, message: string): Promise<IBidMessages>;
  createSystemMessage(senderId: string, recipientId: string, productId: string, bidId: string | null, message: string): Promise<IBidMessages>;
  createProductInquiryMessage(senderId: string, recipientId: string, productId: string, message: string, product: any): Promise<IBidMessages>;
  getBidMessages(userId: string, productId?: string): Promise<IBidMessages[]>;
  getConversations(userId: string): Promise<any[]>;
  markMessageAsRead(messageId: string, userId: string): Promise<IBidMessages>;
  
  // Admin methods
  getAllMessagesForAdmin(filters: any, page: number, limit: number): Promise<{ messages: IBidMessages[]; total: number; page: number; totalPages: number }>;
}

@injectable()
export class BidMessageService extends BaseService implements IBidMessageService {
  constructor(
    @inject(TYPES.BidMessages) private BidMessage: Model<IBidMessages>,
    @inject(TYPES.User) private User: Model<IUser>
  ) {
    super();
  }

  async createBidProposalMessage(
    senderId: string, 
    recipientId: string, 
    productId: string, 
    bidId: string, 
    message: string
  ): Promise<IBidMessages> {
    if (!this.isValidObjectId(senderId)) throw new Error(`Invalid senderId format: ${senderId}`);
    if (!this.isValidObjectId(recipientId)) throw new Error(`Invalid recipientId format: ${recipientId}`);
    if (!this.isValidObjectId(productId)) throw new Error(`Invalid productId format: ${productId}`);
    if (!this.isValidObjectId(bidId)) throw new Error(`Invalid bidId format: ${bidId}`);

    const newBidMessage = await this.BidMessage.create({
      sender: senderId,
      recipient: recipientId,
      product: productId,
      bid: bidId,
      type: 'BID_PROPOSAL',
      message: message
    });

    // [SSE] notify both parties
    try {
      streamController.publishToMany([senderId, recipientId], 'bid:message', {
        id: newBidMessage.id,
        productId,
        bidId,
        type: 'BID_PROPOSAL',
        message,
        senderId,
        createdAt: newBidMessage.createdAt,
      });
    } catch (e) { /* noop */ }

    return newBidMessage;
  }

  async createSystemMessage(
    senderId: string, 
    recipientId: string, 
    productId: string, 
    bidId: string | null, 
    message: string
  ): Promise<IBidMessages> {
    if (!this.isValidObjectId(senderId)) throw new Error(`Invalid senderId format: ${senderId}`);
    if (!this.isValidObjectId(recipientId)) throw new Error(`Invalid recipientId format: ${recipientId}`);
    if (!this.isValidObjectId(productId)) throw new Error(`Invalid productId format: ${productId}`);
    if (bidId && !this.isValidObjectId(bidId)) throw new Error(`Invalid bidId format: ${bidId}`);

    const messageData: any = {
      sender: senderId,
      recipient: recipientId,
      product: productId,
      type: 'SYSTEM',
      message: message
    };
    if (bidId) messageData.bid = bidId;

    const newBidMessage = await this.BidMessage.create(messageData);

    // [SSE] notify both parties
    try {
      streamController.publishToMany([senderId, recipientId], 'bid:message', {
        id: newBidMessage.id,
        productId,
        bidId: bidId || undefined,
        type: 'SYSTEM',
        message,
        senderId,
        createdAt: newBidMessage.createdAt,
      });
    } catch (e) { /* noop */ }

    return newBidMessage;
  }

  async createProductInquiryMessage(
    senderId: string, 
    recipientId: string, 
    productId: string, 
    message: string,
    product: any
  ): Promise<IBidMessages> {
    if (!this.isValidObjectId(senderId)) throw new Error(`Invalid senderId format: ${senderId}`);
    if (!this.isValidObjectId(recipientId)) throw new Error(`Invalid recipientId format: ${recipientId}`);
    if (!this.isValidObjectId(productId)) throw new Error(`Invalid productId format: ${productId}`);

    const newBidMessage = await this.BidMessage.create({
      sender: senderId,
      recipient: recipientId,
      product: productId,
      type: 'PRODUCT_INQUIRY',
      message: message
    });

    // [SSE] notify both parties
    try {
      streamController.publishToMany([senderId, recipientId], 'bid:message', {
        id: newBidMessage.id,
        productId,
        type: 'PRODUCT_INQUIRY',
        message,
        senderId,
        createdAt: newBidMessage.createdAt,
      });
    } catch (e) { /* noop */ }

    return newBidMessage;
  }

  private isValidObjectId(id: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  async createBidAcceptedMessage(
    senderId: string, 
    recipientId: string, 
    productId: string, 
    bidId: string, 
    message: string
  ): Promise<IBidMessages> {
    const newBidMessage = await this.BidMessage.create({
      sender: senderId,
      recipient: recipientId,
      product: productId,
      bid: bidId,
      type: 'BID_ACCEPTED',
      message: message
    });

    // [SSE] notify both parties
    try {
      streamController.publishToMany([senderId, recipientId], 'bid:message', {
        id: newBidMessage.id,
        productId,
        bidId,
        type: 'BID_ACCEPTED',
        message,
        senderId,
        createdAt: newBidMessage.createdAt,
      });
      // optional: a direct lightweight update
      streamController.publishToMany([senderId, recipientId], 'bid:update', {
        bidId,
        productId,
        status: 'ACCEPTED',
        createdAt: newBidMessage.createdAt,
      });
    } catch (e) { /* noop */ }

    return newBidMessage;
  }

  async createBidRejectedMessage(
    senderId: string, 
    recipientId: string, 
    productId: string, 
    bidId: string, 
    message: string
  ): Promise<IBidMessages> {
    const newBidMessage = await this.BidMessage.create({
      sender: senderId,
      recipient: recipientId,
      product: productId,
      bid: bidId,
      type: 'BID_REJECTED',
      message: message
    });

    // [SSE] notify both parties
    try {
      streamController.publishToMany([senderId, recipientId], 'bid:message', {
        id: newBidMessage.id,
        productId,
        bidId,
        type: 'BID_REJECTED',
        message,
        senderId,
        createdAt: newBidMessage.createdAt,
      });
      streamController.publishToMany([senderId, recipientId], 'bid:update', {
        bidId,
        productId,
        status: 'REJECTED',
        createdAt: newBidMessage.createdAt,
      });
    } catch (e) { /* noop */ }

    return newBidMessage;
  }

  async getBidMessages(userId: string, productId?: string): Promise<IBidMessages[]> {
    try {
      const filter: any = {
        $or: [
          { sender: userId },
          { recipient: userId }
        ]
      };
      if (productId) filter.product = productId;

      const messages = await this.BidMessage.find(filter)
        .populate('sender', 'firstName lastName email')
        .populate('recipient', 'firstName lastName email')
        .populate('product', 'name images price')
        .populate('bid')
        .sort({ createdAt: 1 });

      return messages || [];
    } catch (error) {
      console.error('Error in getBidMessages:', error);
      return [];
    }
  }

  async getConversations(userId: string): Promise<any[]> {
    try {
      console.log('=== CONVERSATIONS AGGREGATION DEBUG ===');
      console.log('User ID:', userId);
      
      const conversations = await this.BidMessage.aggregate([
        { $match: { $or: [ { sender: this.toObjectId(userId) }, { recipient: this.toObjectId(userId) } ] } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$product', lastMessage: { $first: '$$ROOT' }, messageCount: { $sum: 1 }, lastMessageDate: { $first: '$createdAt' } } },
        { $sort: { lastMessageDate: -1 } },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'productData' } },
        { $lookup: { from: 'users', localField: 'lastMessage.sender', foreignField: '_id', as: 'senderData' } },
        { $lookup: { from: 'users', localField: 'lastMessage.recipient', foreignField: '_id', as: 'recipientData' } },
        {
          $project: {
            product: {
              $let: {
                vars: { productData: { $arrayElemAt: ['$productData', 0] } },
                in: {
                  id: { $toString: '$_id' },
                  _id: '$_id',
                  name: '$$productData.name',
                  images: '$$productData.images',
                  price: '$$productData.price',
                  owner: '$$productData.owner'
                }
              }
            },
            lastMessage: {
              id: { $toString: '$lastMessage._id' },
              _id: '$lastMessage._id',
              message: '$lastMessage.message',
              type: '$lastMessage.type',
              createdAt: '$lastMessage.createdAt',
              sender: {
                $let: {
                  vars: { senderData: { $arrayElemAt: ['$senderData', 0] } },
                  in: {
                    _id: '$$senderData._id',
                    firstName: '$$senderData.firstName',
                    lastName: '$$senderData.lastName',
                    email: '$$senderData.email'
                  }
                }
              },
              recipient: {
                $let: {
                  vars: { recipientData: { $arrayElemAt: ['$recipientData', 0] } },
                  in: {
                    _id: '$$recipientData._id',
                    firstName: '$$recipientData.firstName',
                    lastName: '$$recipientData.lastName',
                    email: '$$recipientData.email'
                  }
                }
              }
            },
            messageCount: '$messageCount',
            unreadCount: 0
          }
        }
      ]);
      
      console.log('Aggregation pipeline completed');
      console.log('Conversations found:', conversations.length);
      if (conversations.length > 0) {
        console.log('First conversation structure:', {
          productId: conversations[0].product?.id,
          productName: conversations[0].product?.name,
          lastMessageType: conversations[0].lastMessage?.type,
          lastMessageDate: conversations[0].lastMessage?.createdAt
        });
      }
      console.log('=== END CONVERSATIONS DEBUG ===');
      
      return conversations;
    } catch (error) {
      console.error('Error in MongoDB aggregation:', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      console.log('Falling back to application-level grouping...');
      return this.getConversationsFallback(userId);
    }
  }
  
  private async getConversationsFallback(userId: string): Promise<any[]> {
    try {
      const allMessages = await this.getBidMessages(userId);
      if (allMessages.length === 0) return [];
      
      const plainMessages = allMessages.map(msg => {
        const msgObj = (msg as any).toJSON ? (msg as any).toJSON() : msg;
        return msgObj;
      });
      
      const conversationsMap = new Map();
      for (const message of plainMessages) {
        const productId = message.product?.id || message.product?._id?.toString() || message.product?.toString();
        if (!productId) continue;
        
        if (!conversationsMap.has(productId)) {
          conversationsMap.set(productId, {
            product: {
              id: productId,
              _id: message.product._id || message.product.id,
              name: message.product.name,
              images: message.product.images,
              price: message.product.price,
              owner: message.product.owner
            },
            lastMessage: null,
            messageCount: 0,
            unreadCount: 0
          });
        }
        
        const conversation = conversationsMap.get(productId);
        conversation.messageCount++;
        if (!conversation.lastMessage || new Date(message.createdAt) > new Date(conversation.lastMessage.createdAt)) {
          conversation.lastMessage = {
            id: message.id || message._id?.toString(),
            _id: message._id,
            message: message.message,
            type: message.type,
            createdAt: message.createdAt,
            sender: message.sender,
            recipient: message.recipient,
            bid: message.bid
          };
        }
      }
      
      return Array.from(conversationsMap.values()).sort((a, b) => {
        const dateA = new Date(a.lastMessage?.createdAt || 0);
        const dateB = new Date(b.lastMessage?.createdAt || 0);
        return dateB.getTime() - dateA.getTime();
      });
    } catch (error) {
      console.error('Fallback method also failed:', error);
      return [];
    }
  }

  private toObjectId(id: string) {
    const mongoose = require('mongoose');
    return new mongoose.Types.ObjectId(id);
  }

  async markMessageAsRead(messageId: string, userId: string): Promise<IBidMessages> {
    const message = await this.BidMessage.findOne({
      _id: messageId,
      recipient: userId
    });

    if (!message) {
      throw new Error('Message not found or you are not the recipient');
    }

    return message;
  }

  async getAllMessagesForAdmin(
    filters: any,
    page: number,
    limit: number
  ): Promise<{ messages: IBidMessages[]; total: number; page: number; totalPages: number }> {
    const query: any = {};
    if (filters.productId) query.product = this.toObjectId(filters.productId);
    if (filters.type) query.type = filters.type;

    const total = await this.BidMessage.countDocuments(query);
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const messages = await this.BidMessage.find(query)
      .populate('sender', 'firstName lastName email')
      .populate('recipient', 'firstName lastName email')
      .populate('product', 'name images price')
      .populate('bid')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return { messages, total, page, totalPages };
  }
}
