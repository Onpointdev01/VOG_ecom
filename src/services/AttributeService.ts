import { injectable, inject } from 'inversify';
import { Model } from 'mongoose';
import { BaseService } from './BaseService';
import { IAttribute } from '../models';
import AppError from '../utils/errors/AppError';
import TYPES from '../di';

export interface CreateAttributeDTO {
  name: string;
  displayName: string;
  type: 'select' | 'color' | 'text';
  description?: string;
  iconUrl?: string;
  isRequired?: boolean;
  displayOrder?: number;
}

export interface UpdateAttributeDTO {
  name?: string;
  displayName?: string;
  type?: 'select' | 'color' | 'text';
  description?: string;
  iconUrl?: string;
  isRequired?: boolean;
  isActive?: boolean;
  displayOrder?: number;
}

export interface IAttributeService {
  createAttribute(data: CreateAttributeDTO): Promise<IAttribute>;
  getAllAttributes(): Promise<IAttribute[]>;
  getActiveAttributes(): Promise<IAttribute[]>;
  getAttributeById(id: string): Promise<IAttribute>;
  getAttributeByName(name: string): Promise<IAttribute | null>;
  updateAttribute(id: string, data: UpdateAttributeDTO): Promise<IAttribute>;
  deleteAttribute(id: string): Promise<void>;
}

@injectable()
export class AttributeService extends BaseService implements IAttributeService {
  constructor(@inject(TYPES.Attribute) private Attribute: Model<IAttribute>) {
    super();
  }

  async createAttribute(data: CreateAttributeDTO): Promise<IAttribute> {
    // Check if attribute with this name already exists
    const existing = await this.Attribute.findOne({ name: data.name.toLowerCase() });
    if (existing) {
      throw new AppError('Attribute with this name already exists', 409);
    }

    const attribute = new this.Attribute({
      ...data,
      name: data.name.toLowerCase(), // Ensure lowercase for consistency
    });

    await attribute.save();
    return attribute.toJSON() as IAttribute;
  }

  async getAllAttributes(): Promise<IAttribute[]> {
    const attributes = await this.Attribute.find().sort({ displayOrder: 1, name: 1 });
    return attributes.map((a) => a.toJSON() as IAttribute);
  }

  async getActiveAttributes(): Promise<IAttribute[]> {
    const attributes = await this.Attribute.find({ isActive: true }).sort({ displayOrder: 1, name: 1 });
    return attributes.map((a) => a.toJSON() as IAttribute);
  }

  async getAttributeById(id: string): Promise<IAttribute> {
    const attribute = await this.Attribute.findById(id);

    if (!attribute) {
      throw new AppError('Attribute not found', 404);
    }

    return attribute.toJSON() as IAttribute;
  }

  async getAttributeByName(name: string): Promise<IAttribute | null> {
    return await this.Attribute.findOne({ name: name.toLowerCase() });
  }

  async updateAttribute(id: string, data: UpdateAttributeDTO): Promise<IAttribute> {
    // If updating name, check for duplicates
    if (data.name) {
      const existing = await this.Attribute.findOne({
        _id: { $ne: id },
        name: data.name.toLowerCase(),
      });

      if (existing) {
        throw new AppError('Another attribute with this name already exists', 409);
      }

      data.name = data.name.toLowerCase();
    }

    const attribute = await this.Attribute.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!attribute) {
      throw new AppError('Attribute not found', 404);
    }

    return attribute.toJSON() as IAttribute;
  }

  async deleteAttribute(id: string): Promise<void> {
    // TODO: Check if attribute is in use by any categories or product variants
    // For now, we'll allow deletion
    const result = await this.Attribute.findByIdAndDelete(id);

    if (!result) {
      throw new AppError('Attribute not found', 404);
    }
  }
}
