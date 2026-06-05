import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IShippingZone } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import { DEFAULT_SHIPPING_FEE, neighborhoodCodeFromName } from '../utils/neighborhoodCode';

export interface CreateShippingZoneDTO {
  name: string;
  code?: string;
  shippingFee: number;
  estimatedDeliveryDays: number;
  isActive?: boolean;
}

export interface UpdateShippingZoneDTO {
  name?: string;
  code?: string;
  shippingFee?: number;
  estimatedDeliveryDays?: number;
  isActive?: boolean;
}

export interface IShippingZoneService {
  createShippingZone(data: CreateShippingZoneDTO): Promise<IShippingZone>;
  getAllShippingZones(): Promise<IShippingZone[]>;
  getActiveShippingZones(): Promise<IShippingZone[]>;
  getShippingZoneById(id: string): Promise<IShippingZone>;
  getShippingZoneByCode(code: string): Promise<IShippingZone | null>;
  updateShippingZone(id: string, data: UpdateShippingZoneDTO): Promise<IShippingZone>;
  deleteShippingZone(id: string): Promise<void>;
  calculateShippingFee(neighborhoodCode: string): Promise<number>;
}

@injectable()
export class ShippingZoneService extends BaseService implements IShippingZoneService {
  constructor(@inject(TYPES.ShippingZone) private ShippingZone: Model<IShippingZone>) {
    super();
  }

  private normalizeCode(code: string): string {
    return neighborhoodCodeFromName(code);
  }

  private resolveCode(data: { name: string; code?: string }): string {
    if (data.code?.trim()) {
      return this.normalizeCode(data.code);
    }
    return neighborhoodCodeFromName(data.name);
  }

  async createShippingZone(data: CreateShippingZoneDTO): Promise<IShippingZone> {
    const code = this.resolveCode(data);
    const existing = await this.ShippingZone.findOne({
      $or: [{ name: data.name.trim() }, { code }],
    });

    if (existing) {
      throw new AppError('A neighborhood with this name or code already exists', 409);
    }

    const shippingZone = new this.ShippingZone({
      ...data,
      name: data.name.trim(),
      code,
    });
    await shippingZone.save();

    return shippingZone;
  }

  async getAllShippingZones(): Promise<IShippingZone[]> {
    return await this.ShippingZone.find().sort({ name: 1 });
  }

  async getActiveShippingZones(): Promise<IShippingZone[]> {
    return await this.ShippingZone.find({ isActive: true }).sort({ name: 1 });
  }

  async getShippingZoneById(id: string): Promise<IShippingZone> {
    const shippingZone = await this.ShippingZone.findById(id);

    if (!shippingZone) {
      throw new AppError('Shipping zone not found', 404);
    }

    return shippingZone;
  }

  async getShippingZoneByCode(code: string): Promise<IShippingZone | null> {
    const normalized = this.normalizeCode(code);

    let shippingZone = await this.ShippingZone.findOne({
      code: new RegExp(`^${normalized}$`, 'i'),
      isActive: true,
    });

    if (!shippingZone) {
      shippingZone = await this.ShippingZone.findOne({
        name: new RegExp(`^${code.trim()}`, 'i'),
        isActive: true,
      });
    }

    return shippingZone;
  }

  async updateShippingZone(id: string, data: UpdateShippingZoneDTO): Promise<IShippingZone> {
    const updatePayload: UpdateShippingZoneDTO = { ...data };

    if (data.name && !data.code) {
      updatePayload.code = neighborhoodCodeFromName(data.name);
    } else if (data.code) {
      updatePayload.code = this.normalizeCode(data.code);
    }

    if (updatePayload.name || updatePayload.code) {
      const existing = await this.ShippingZone.findOne({
        _id: { $ne: id },
        $or: [
          ...(updatePayload.name ? [{ name: updatePayload.name.trim() }] : []),
          ...(updatePayload.code ? [{ code: updatePayload.code }] : []),
        ],
      });

      if (existing) {
        throw new AppError('Another neighborhood with this name or code already exists', 409);
      }
    }

    const shippingZone = await this.ShippingZone.findByIdAndUpdate(id, updatePayload, {
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

  async calculateShippingFee(neighborhoodCode: string): Promise<number> {
    if (!neighborhoodCode?.trim()) {
      return DEFAULT_SHIPPING_FEE;
    }

    const shippingZone = await this.getShippingZoneByCode(neighborhoodCode);

    if (!shippingZone) {
      console.warn(
        `No shipping zone found for neighborhood: ${neighborhoodCode}, using default fee`
      );
      return DEFAULT_SHIPPING_FEE;
    }

    return shippingZone.shippingFee;
  }
}
