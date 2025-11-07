import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { ISeller } from '../models/Seller';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';

export interface ISellerService {
  getSellerById(id: string): Promise<ISeller>;
}

@injectable()
export class SellerService extends BaseService implements ISellerService {
  constructor(
    @inject(TYPES.Seller) private Seller: Model<ISeller>
  ) {
    super();
  }

  async getSellerById(id: string): Promise<ISeller> {
    const seller = await this.Seller.findById(id)
      .populate('user', 'firstName lastName email phoneNumber profilePicture')
      .lean();

    if (!seller) {
      throw new AppError('Seller not found', 404);
    }

    // Transform for API response
    return {
      ...seller,
      id: (seller._id as any).toString(),
      _id: undefined,
    } as any;
  }
}
