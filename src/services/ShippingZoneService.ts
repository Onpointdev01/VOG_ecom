import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IShippingZone } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';

export interface CreateShippingZoneDTO {
  province: string;
  provinceCode: string;
  shippingFee: number;
  estimatedDeliveryDays: number;
  isActive?: boolean;
}

export interface UpdateShippingZoneDTO {
  province?: string;
  provinceCode?: string;
  shippingFee?: number;
  estimatedDeliveryDays?: number;
  isActive?: boolean;
}

export interface IShippingZoneService {
  createShippingZone(data: CreateShippingZoneDTO): Promise<IShippingZone>;
  getAllShippingZones(): Promise<IShippingZone[]>;
  getActiveShippingZones(): Promise<IShippingZone[]>;
  getShippingZoneById(id: string): Promise<IShippingZone>;
  getShippingZoneByProvinceCode(provinceCode: string): Promise<IShippingZone | null>;
  updateShippingZone(id: string, data: UpdateShippingZoneDTO): Promise<IShippingZone>;
  deleteShippingZone(id: string): Promise<void>;
  calculateShippingFee(provinceCode: string): Promise<number>;
}

@injectable()
export class ShippingZoneService extends BaseService implements IShippingZoneService {
  constructor(@inject(TYPES.ShippingZone) private ShippingZone: Model<IShippingZone>) {
    super();
  }

  async createShippingZone(data: CreateShippingZoneDTO): Promise<IShippingZone> {
    // Check if province or code already exists
    const existing = await this.ShippingZone.findOne({
      $or: [{ province: data.province }, { provinceCode: data.provinceCode }],
    });

    if (existing) {
      throw new AppError('Shipping zone with this province or code already exists', 409);
    }

    const shippingZone = new this.ShippingZone(data);
    await shippingZone.save();

    return shippingZone;
  }

  async getAllShippingZones(): Promise<IShippingZone[]> {
    return await this.ShippingZone.find().sort({ province: 1 });
  }

  async getActiveShippingZones(): Promise<IShippingZone[]> {
    return await this.ShippingZone.find({ isActive: true }).sort({ province: 1 });
  }

  async getShippingZoneById(id: string): Promise<IShippingZone> {
    const shippingZone = await this.ShippingZone.findById(id);

    if (!shippingZone) {
      throw new AppError('Shipping zone not found', 404);
    }

    return shippingZone;
  }

  async getShippingZoneByProvinceCode(provinceCode: string): Promise<IShippingZone | null> {
    // Try to find by province code first (case-insensitive)
    let shippingZone = await this.ShippingZone.findOne({
      provinceCode: new RegExp(`^${provinceCode}$`, 'i'),
      isActive: true,
    });

    // If not found, try to find by province name (case-insensitive)
    if (!shippingZone) {
      shippingZone = await this.ShippingZone.findOne({
        province: new RegExp(`^${provinceCode}`, 'i'),
        isActive: true,
      });
    }

    return shippingZone;
  }

  async updateShippingZone(id: string, data: UpdateShippingZoneDTO): Promise<IShippingZone> {
    // Check if trying to update to existing province/code
    if (data.province || data.provinceCode) {
      const existing = await this.ShippingZone.findOne({
        _id: { $ne: id },
        $or: [
          ...(data.province ? [{ province: data.province }] : []),
          ...(data.provinceCode ? [{ provinceCode: data.provinceCode }] : []),
        ],
      });

      if (existing) {
        throw new AppError('Another shipping zone with this province or code already exists', 409);
      }
    }

    const shippingZone = await this.ShippingZone.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!shippingZone) {
      throw new AppError('Shipping zone not found', 404);
    }

    return shippingZone;
  }

  async deleteShippingZone(id: string): Promise<void> {
    const result = await this.ShippingZone.findByIdAndDelete(id);

    if (!result) {
      throw new AppError('Shipping zone not found', 404);
    }
  }

  async calculateShippingFee(provinceCode: string): Promise<number> {
    const shippingZone = await this.getShippingZoneByProvinceCode(provinceCode);

    if (!shippingZone) {
      // If province not found, return a default shipping fee
      console.warn(`No shipping zone found for province code: ${provinceCode}, using default fee`);
      return 199.99; // Default shipping fee
    }

    return shippingZone.shippingFee;
  }
}
