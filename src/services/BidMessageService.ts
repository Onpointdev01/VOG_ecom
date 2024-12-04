import { inject, injectable } from 'inversify';

import TYPES from '../di';
import { IBidMessages, IUser } from '../models';
import { Model } from 'mongoose';
import { BaseService } from './BaseService';

export interface IBidMessageService {
  createBidProposalMessage(payloadId: string, buyer: string): Promise<IBidMessages>;
}

@injectable()
export class BidMessageService extends BaseService implements IBidMessageService {
  constructor(
    @inject(TYPES.BidMessages) private BidMessage: Model<IBidMessages>,
    @inject(TYPES.User) private User: Model<IUser>
  ) {
    super();
  }
  async createBidProposalMessage(payloadId: string, buyer: string): Promise<IBidMessages> {
    console.log('payloadId: ', payloadId, 'buyer: ', buyer);
    const newBidMessage = new this.BidMessage();
    return newBidMessage;
  }
  //   async createBidProposalMessage(payloadId: string, buyer: string, ): Promise<IBidMessage> {
  //     // Check if bid exists
  //     const existingBid = await this.BidMessage.findById(bid);
  //     if (!existingBid) {
  //       throw new AppError('Bid not found', 404);
  //     }
  //     // Check if sender exists
  //     const existingSender = await this.User.findById(sender);
  //     if (!existingSender) {
  //       throw new AppError('Sender not found', 404);
  //     }
  //     const newBidMessage = new this.BidMessage(payload);
  //     await newBidMessage.save();
  //     return newBidMessage;
}
