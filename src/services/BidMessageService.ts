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
      const conversations = await this.BidMessage.aggregate([
        // Match messages where user is sender or recipient
        {
          $match: {
            $or: [
              { sender: this.toObjectId(userId) },
              { recipient: this.toObjectId(userId) }
            ]
          }
        },
        // Sort by creation date (newest first for getting latest message per product)
        {
          $sort: { createdAt: -1 }
        },
        // Group by product to get conversations
        {
          $group: {
            _id: '$product',
            lastMessage: { $first: '$$ROOT' },
            messageCount: { $sum: 1 },
            lastMessageDate: { $first: '$createdAt' }
          }
        },
        // Sort conversations by most recent message (newest first)
        {
          $sort: { lastMessageDate: -1 }
        },
        // Populate product details
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        // Populate sender details for last message
        {
          $lookup: {
            from: 'users',
            localField: 'lastMessage.sender',
            foreignField: '_id',
            as: 'lastMessage.sender'
          }
        },
        // Populate recipient details for last message
        {
          $lookup: {
            from: 'users',
            localField: 'lastMessage.recipient',
            foreignField: '_id',
            as: 'lastMessage.recipient'
          }
        },
        // Transform the result
        {
          $project: {
            product: { 
              $mergeObjects: [
                { $arrayElemAt: ['$product', 0] },
                { id: { $toString: { $arrayElemAt: ['$product._id', 0] } } }
              ]
            },
            lastMessage: {
              id: { $toString: '$lastMessage._id' },
              message: '$lastMessage.message',
              type: '$lastMessage.type',
              createdAt: '$lastMessage.createdAt',
              sender: { $arrayElemAt: ['$lastMessage.sender', 0] },
              recipient: { $arrayElemAt: ['$lastMessage.recipient', 0] }
            },
            messageCount: 1,
            unreadCount: 0 // TODO: Implement unread logic
          }
        }
      ]);

      return conversations || [];
    } catch (error) {
      console.error('Error in getConversations:', error);
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
}
