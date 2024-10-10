import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IPaymentOption, IUser } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import { CreatePaymentOptionDTO, UpdatePaymentOptionDTO } from '../utils/dtos';

export interface IPaymentOptionService {
  createPaymentOption(payload: CreatePaymentOptionDTO): Promise<IPaymentOption>;
  getAllPaymentOptions(): Promise<IPaymentOption[]>;
  updatePaymentOption(id: string, payload: UpdatePaymentOptionDTO): Promise<IPaymentOption | null>;
  deletePaymentOption(id: string): Promise<void>;
}

@injectable()
export class PaymentOptionService extends BaseService implements IPaymentOptionService {
  constructor(
    @inject(TYPES.PaymentOption) private PaymentOption: Model<IPaymentOption>,
    @inject(TYPES.User) private User: Model<IUser>
  ) {
    super();
  }

  async createPaymentOption(payload: CreatePaymentOptionDTO): Promise<IPaymentOption> {
    const { code } = payload;

    // Check if payment option already exists
    const existingPaymentOption = await this.PaymentOption.findOne({ code });
    if (existingPaymentOption) {
      throw new AppError('Payment option with this code already exists', 400);
    }

    // Create new payment option
    const newPaymentOption = new this.PaymentOption(payload);
    await newPaymentOption.save();

    return newPaymentOption;
  }

  async getAllPaymentOptions(): Promise<IPaymentOption[]> {
    try {
      const paymentOptions = await this.PaymentOption.find();
      return paymentOptions;
    } catch (error) {
      throw new AppError('Error fetching payment options: ' + error, 500);
    }
  }

  async updatePaymentOption(id: string, payload: UpdatePaymentOptionDTO): Promise<IPaymentOption | null> {
    const updatedPaymentOption = await this.PaymentOption.findByIdAndUpdate(id, payload, { new: true });
    if (!updatedPaymentOption) {
      throw new AppError('Payment option not found', 404);
    }
    return updatedPaymentOption;
  }

  async deletePaymentOption(id: string): Promise<void> {
    const result = await this.PaymentOption.findByIdAndDelete(id);
    if (!result) {
      throw new AppError('Payment option not found', 404);
    }
  }

  // Private method to verify user if needed
  private async verifyUser(userId: string): Promise<IUser> {
    const user = await this.User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  }
}
