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
    const filter: any = {
      $or: [
        { sender: userId },
        { recipient: userId }
      ]
    };

    if (productId) {
      filter.product = productId;
    }

    return await this.BidMessage.find(filter)
      .populate('sender', 'firstName lastName email')
      .populate('recipient', 'firstName lastName email')
      .populate('product', 'name images price')
      .populate('bid')
      .sort({ createdAt: -1 });
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
