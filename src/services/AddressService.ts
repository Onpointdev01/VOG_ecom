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
    return this.Address.findOne({ user: userId, isDefault: true });
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<IAddress> {
    await this.Address.updateMany({ user: userId }, { $set: { isDefault: false } });
    const updatedAddress = await this.Address.findByIdAndUpdate(addressId, { $set: { isDefault: true } }, { new: true });

    if (!updatedAddress) throw new AppError('Address not found', 404);
    return updatedAddress;
  }

  async addAddress(address: addressDTO): Promise<IAddress> {
    try {
      // Check if user has any existing addresses
      const existingAddresses = await this.Address.find({ user: address.user });

      // If this is the first address, make it default automatically
      if (existingAddresses.length === 0) {
        address.isDefault = true;
      }

      // If setting as default, clear all other default flags
      if (address.isDefault) {
        await this.Address.updateMany({ user: address.user }, { $set: { isDefault: false } });
      }

      const newAddress = await this.Address.create(address);
      return newAddress;
    } catch (error: any) {
      console.error('Error in addAddress:', error);
      
      // Handle MongoDB validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.keys(error.errors || {}).map(key => {
          const err = error.errors[key];
          return `${key}: ${err.message}`;
        }).join(', ');
        throw new AppError(`Validation failed: ${validationErrors}`, 400);
      }
      
      // Re-throw AppError as-is
      if (error instanceof AppError) {
        throw error;
      }
      
      // Log and throw generic error for unexpected errors
      console.error('Unexpected error during address creation:', error);
      throw new AppError(error?.message || 'Failed to create address. Please try again.', 500);
    }
  }

  async updateAddress(address: addressDTO, id: string): Promise<IAddress> {
    // If trying to unset default flag, check if this is the only address
    const existingAddress = await this.Address.findById(id);
    if (!existingAddress) throw new AppError('Address not found', 404);

    const userAddresses = await this.Address.find({ user: address.user });

    // If this is the only address, force it to remain default
    if (userAddresses.length === 1) {
      address.isDefault = true;
    }

    // If this was the default address and user is trying to unset it
    if (existingAddress.isDefault && !address.isDefault && userAddresses.length > 1) {
      throw new AppError('Cannot unset default address. Please set another address as default first.', 400);
    }

    // If setting as default, clear all other default flags
    if (address.isDefault) {
      await this.Address.updateMany({ user: address.user }, { $set: { isDefault: false } });
    }

    console.log(address);
    const updatedAddress = await this.Address.findByIdAndUpdate(id, address, { new: true });
    if (!updatedAddress) throw new AppError('Address not found', 404);
    return updatedAddress;
  }

  async deleteAddress(id: string): Promise<IAddress> {
    const addressToDelete = await this.Address.findById(id);
    if (!addressToDelete) throw new AppError('Address not found', 404);

    const userId = addressToDelete.user;
    const wasDefault = addressToDelete.isDefault;

    // Delete the address
    const result = await this.Address.findByIdAndDelete(id);
    if (!result) throw new AppError('Address not found', 404);

    // If the deleted address was default, set another address as default
    if (wasDefault) {
      const remainingAddresses = await this.Address.find({ user: userId });
      if (remainingAddresses.length > 0) {
        // Set the first remaining address as default
        await this.Address.findByIdAndUpdate(remainingAddresses[0]._id, { isDefault: true });
      }
    }

    return result;
  }

  async findAddressById(id: string): Promise<IAddress> {
    const address = await this.Address.findById(id);
    if (!address) throw new AppError('Address not found', 404);
    return address;
  }
}
