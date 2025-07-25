import { inject, injectable } from 'inversify';

import TYPES from '../di';
import { IBidMessages, IUser } from '../models';
import { Model } from 'mongoose';
import { BaseService } from './BaseService';

export interface IBidMessageService {
  createBidProposalMessage(senderId: string, recipientId: string, productId: string, bidId: string, message: string): Promise<IBidMessages>;
  createBidAcceptedMessage(senderId: string, recipientId: string, productId: string, bidId: string, message: string): Promise<IBidMessages>;
  createBidRejectedMessage(senderId: string, recipientId: string, productId: string, bidId: string, message: string): Promise<IBidMessages>;
  getBidMessages(userId: string, productId?: string): Promise<IBidMessages[]>;
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
    try {
      console.log('💬 BidMessageService: Creating bid proposal message with:', {
        senderId,
        recipientId,
        productId,
        bidId,
        messageLength: message.length
      });

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

      console.log('✅ BidMessageService: Bid proposal message created successfully:', newBidMessage._id);
      return newBidMessage;
    } catch (error) {
      console.error('❌ BidMessageService: Error creating bid proposal message:', error);
      console.error('❌ BidMessageService: Error details:', error instanceof Error ? error.message : String(error));
      throw error; // Re-throw to let caller handle
    }
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
        .sort({ createdAt: -1 });

      return messages || [];
    } catch (error) {
      console.error('Error in getBidMessages:', error);
      // Return empty array instead of throwing to prevent 500 errors
      return [];
    }
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
