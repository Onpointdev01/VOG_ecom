import { inject, injectable } from 'inversify';

import TYPES from '../di';
import { IBidMessages, IUser } from '../models';
import { Model } from 'mongoose';
import { BaseService } from './BaseService';

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
    // Validate ObjectId formats
    if (!this.isValidObjectId(senderId)) {
      throw new Error(`Invalid senderId format: ${senderId}`);
    }
    if (!this.isValidObjectId(recipientId)) {
      throw new Error(`Invalid recipientId format: ${recipientId}`);
    }
    if (!this.isValidObjectId(productId)) {
      throw new Error(`Invalid productId format: ${productId}`);
    }
    if (!this.isValidObjectId(bidId)) {
      throw new Error(`Invalid bidId format: ${bidId}`);
    }

    const newBidMessage = await this.BidMessage.create({
      sender: senderId,
      recipient: recipientId,
      product: productId,
      bid: bidId,
      type: 'BID_PROPOSAL',
      message: message
    });

    return newBidMessage;
  }

  async createSystemMessage(
    senderId: string, 
    recipientId: string, 
    productId: string, 
    bidId: string | null, 
    message: string
  ): Promise<IBidMessages> {
    // Validate ObjectId formats
    if (!this.isValidObjectId(senderId)) {
      throw new Error(`Invalid senderId format: ${senderId}`);
    }
    if (!this.isValidObjectId(recipientId)) {
      throw new Error(`Invalid recipientId format: ${recipientId}`);
    }
    if (!this.isValidObjectId(productId)) {
      throw new Error(`Invalid productId format: ${productId}`);
    }
    if (bidId && !this.isValidObjectId(bidId)) {
      throw new Error(`Invalid bidId format: ${bidId}`);
    }

    const messageData: any = {
      sender: senderId,
      recipient: recipientId,
      product: productId,
      type: 'SYSTEM',
      message: message
    };

    // Only add bid if provided
    if (bidId) {
      messageData.bid = bidId;
    }

    const newBidMessage = await this.BidMessage.create(messageData);
    return newBidMessage;
  }

  async createProductInquiryMessage(
    senderId: string, 
    recipientId: string, 
    productId: string, 
    message: string,
    product: any
  ): Promise<IBidMessages> {
    // Validate ObjectId formats
    if (!this.isValidObjectId(senderId)) {
      throw new Error(`Invalid senderId format: ${senderId}`);
    }
    if (!this.isValidObjectId(recipientId)) {
      throw new Error(`Invalid recipientId format: ${recipientId}`);
    }
    if (!this.isValidObjectId(productId)) {
      throw new Error(`Invalid productId format: ${productId}`);
    }

    const newBidMessage = await this.BidMessage.create({
      sender: senderId,
      recipient: recipientId,
      product: productId,
      type: 'PRODUCT_INQUIRY',
      message: message
      // No bid field for initial inquiry
    });

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

      if (productId) {
        filter.product = productId;
      }

      const messages = await this.BidMessage.find(filter)
        .populate('sender', 'firstName lastName email')
        .populate('recipient', 'firstName lastName email')
        .populate('product', 'name images price')
        .populate('bid')
        .sort({ createdAt: 1 }); // 1 = ascending (oldest first, newest last)

      return messages || [];
    } catch (error) {
      console.error('Error in getBidMessages:', error);
      // Return empty array instead of throwing to prevent 500 errors
      return [];
    }
  }

  async getConversations(userId: string): Promise<any[]> {
    try {
      console.log('=== CONVERSATIONS AGGREGATION DEBUG ===');
      console.log('User ID:', userId);
      
      const conversations = await this.BidMessage.aggregate([
        // Stage 1: Match messages where user is sender or recipient
        {
          $match: {
            $or: [
              { sender: this.toObjectId(userId) },
              { recipient: this.toObjectId(userId) }
            ]
          }
        },
        
        // Stage 2: Sort by creation date (newest first for grouping)
        {
          $sort: { createdAt: -1 }
        },
        
        // Stage 3: Group by product to get conversations
        {
          $group: {
            _id: '$product',
            lastMessage: { $first: '$$ROOT' },
            messageCount: { $sum: 1 },
            lastMessageDate: { $first: '$createdAt' }
          }
        },
        
        // Stage 4: Sort conversations by most recent message
        {
          $sort: { lastMessageDate: -1 }
        },
        
        // Stage 5: Lookup product details
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'productData'
          }
        },
        
        // Stage 6: Lookup sender details for last message
        {
          $lookup: {
            from: 'users',
            localField: 'lastMessage.sender',
            foreignField: '_id',
            as: 'senderData'
          }
        },
        
        // Stage 7: Lookup recipient details for last message
        {
          $lookup: {
            from: 'users',
            localField: 'lastMessage.recipient',
            foreignField: '_id',
            as: 'recipientData'
          }
        },
        
        // Stage 8: Transform the result to match expected API format
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
            unreadCount: 0 // TODO: Implement unread logic later
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
      
      // Fallback to application-level grouping if aggregation fails
      console.log('Falling back to application-level grouping...');
      return this.getConversationsFallback(userId);
    }
  }
  
  // Fallback method using application-level grouping
  private async getConversationsFallback(userId: string): Promise<any[]> {
    try {
      const allMessages = await this.getBidMessages(userId);
      
      if (allMessages.length === 0) {
        return [];
      }
      
      // Convert Mongoose documents to plain objects first
      const plainMessages = allMessages.map(msg => {
        const msgObj = (msg as any).toJSON ? (msg as any).toJSON() : msg;
        return msgObj;
      });
      
      // Group messages by product
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
        
        if (!conversation.lastMessage || 
            new Date(message.createdAt) > new Date(conversation.lastMessage.createdAt)) {
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

  // =====================================
  // ADMIN METHODS
  // =====================================

  /**
   * Get all bid messages for admin with filtering and pagination
   */
  async getAllMessagesForAdmin(
    filters: any,
    page: number,
    limit: number
  ): Promise<{ messages: IBidMessages[]; total: number; page: number; totalPages: number }> {
    const query: any = {};

    if (filters.productId) {
      query.product = this.toObjectId(filters.productId);
    }

    if (filters.type) {
      query.type = filters.type;
    }

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