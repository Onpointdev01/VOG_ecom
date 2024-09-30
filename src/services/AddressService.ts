import { inject, injectable } from 'inversify';
import { IAddress, IUser } from '../models';
import { BaseService } from './BaseService';
import AppError from '../utils/errors/AppError';
import TYPES from '../di';
import { Model } from 'mongoose';
import { addressDTO } from '../utils/dtos';

export interface IAddressService {
  addAddress(address: addressDTO): Promise<IAddress>;
  updateAddress(address: addressDTO, id: string): Promise<IAddress>;
  deleteAddress(id: string): Promise<IAddress>;
  findAddressById(id: string): Promise<IAddress>;
  findAddressesByUser(userId: string): Promise<IAddress[]>;
  findDefaultAddress(userId: string): Promise<IAddress | null>;
  setDefaultAddress(userId: string, addressId: string): Promise<IAddress>;
}

@injectable()
export class AddressService extends BaseService implements IAddressService {
  constructor(@inject(TYPES.User) private User: Model<IUser>, @inject(TYPES.Address) private Address: Model<IAddress>) {
    super();
  }
  async findAddressesByUser(userId: string): Promise<IAddress[]> {
    const address = await this.Address.find({ user: userId });
    return address;
  }

  async findDefaultAddress(userId: string): Promise<IAddress | null> {
    return this.Address.findOne({ user: userId, default: true });
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<IAddress> {
    await this.Address.updateMany({ user: userId }, { $set: { default: false } });
    const updatedAddress = await this.Address.findByIdAndUpdate(addressId, { $set: { default: true } }, { new: true });

    if (!updatedAddress) throw new AppError('Address not found', 404);
    return updatedAddress;
  }

  async addAddress(address: addressDTO): Promise<IAddress> {
    if (address.isDefault) {
      await this.Address.updateMany({ user: address.user }, { $set: { default: false } });
    }
    const newAddress = await this.Address.create(address);
    return newAddress;
  }

  async updateAddress(address: addressDTO, id: string): Promise<IAddress> {
    if (address.isDefault) {
      await this.Address.updateMany({ user: address.user }, { $set: { default: false } });
    }
    console.log(address);
    const updatedAddress = await this.Address.findByIdAndUpdate(id, address, { new: true });
    if (!updatedAddress) throw new AppError('Address not found', 404);
    return updatedAddress;
  }

  async deleteAddress(id: string): Promise<IAddress> {
    const result = await this.Address.findByIdAndDelete(id);
    if (!result) throw new AppError('Address not found', 404);
    return result;
  }

  async findAddressById(id: string): Promise<IAddress> {
    const address = await this.Address.findById(id);
    if (!address) throw new AppError('Address not found', 404);
    return address;
  }
}
