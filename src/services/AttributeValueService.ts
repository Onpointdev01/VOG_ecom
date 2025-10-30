import { injectable, inject } from 'inversify';
import { Model } from 'mongoose';
import { BaseService } from './BaseService';
import { IAttributeValue, IAttribute } from '../models';
import AppError from '../utils/errors/AppError';
import TYPES from '../di';

export interface CreateAttributeValueDTO {
  attribute: string;  // Attribute ID
  value: string;
  displayOrder?: number;
  colorHex?: string;
}

export interface UpdateAttributeValueDTO {
  value?: string;
  displayOrder?: number;
  colorHex?: string;
  isActive?: boolean;
}

export interface IAttributeValueService {
  createAttributeValue(data: CreateAttributeValueDTO): Promise<IAttributeValue>;
  getAttributeValues(attributeId: string): Promise<IAttributeValue[]>;
  getActiveAttributeValues(attributeId: string): Promise<IAttributeValue[]>;
  getAttributeValueById(id: string): Promise<IAttributeValue>;
  updateAttributeValue(id: string, data: UpdateAttributeValueDTO): Promise<IAttributeValue>;
  deleteAttributeValue(id: string): Promise<void>;
  bulkCreateAttributeValues(attributeId: string, values: string[]): Promise<IAttributeValue[]>;
}

@injectable()
export class AttributeValueService extends BaseService implements IAttributeValueService {
  constructor(
    @inject(TYPES.AttributeValue) private AttributeValue: Model<IAttributeValue>,
    @inject(TYPES.Attribute) private Attribute: Model<IAttribute>
  ) {
    super();
  }

  async createAttributeValue(data: CreateAttributeValueDTO): Promise<IAttributeValue> {
    // Verify attribute exists
    const attribute = await this.Attribute.findById(data.attribute);
    if (!attribute) {
      throw new AppError('Attribute not found', 404);
    }

    // Check for duplicate value for this attribute
    const existing = await this.AttributeValue.findOne({
      attribute: data.attribute,
      value: data.value,
    });

    if (existing) {
      throw new AppError('This value already exists for this attribute', 409);
    }

    // Validate colorHex if attribute type is color
    if (attribute.type === 'color' && data.colorHex) {
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;
      if (!hexRegex.test(data.colorHex)) {
        throw new AppError('Invalid hex color format. Use format: #RRGGBB', 400);
      }
    }

    const attributeValue = new this.AttributeValue(data);
    await attributeValue.save();

    return attributeValue;
  }

  async getAttributeValues(attributeId: string): Promise<IAttributeValue[]> {
    return await this.AttributeValue.find({ attribute: attributeId })
      .populate('attribute', 'name displayName type')
      .sort({ displayOrder: 1, value: 1 });
  }

  async getActiveAttributeValues(attributeId: string): Promise<IAttributeValue[]> {
    return await this.AttributeValue.find({
      attribute: attributeId,
      isActive: true,
    })
      .populate('attribute', 'name displayName type')
      .sort({ displayOrder: 1, value: 1 });
  }

  async getAttributeValueById(id: string): Promise<IAttributeValue> {
    const attributeValue = await this.AttributeValue.findById(id).populate(
      'attribute',
      'name displayName type'
    );

    if (!attributeValue) {
      throw new AppError('Attribute value not found', 404);
    }

    return attributeValue;
  }

  async updateAttributeValue(id: string, data: UpdateAttributeValueDTO): Promise<IAttributeValue> {
    const attributeValue = await this.AttributeValue.findById(id);

    if (!attributeValue) {
      throw new AppError('Attribute value not found', 404);
    }

    // If updating value, check for duplicates
    if (data.value) {
      const existing = await this.AttributeValue.findOne({
        _id: { $ne: id },
        attribute: attributeValue.attribute,
        value: data.value,
      });

      if (existing) {
        throw new AppError('This value already exists for this attribute', 409);
      }
    }

    // Validate colorHex if provided
    if (data.colorHex !== undefined) {
      const attribute = await this.Attribute.findById(attributeValue.attribute);
      if (attribute?.type === 'color' && data.colorHex) {
        const hexRegex = /^#[0-9A-Fa-f]{6}$/;
        if (!hexRegex.test(data.colorHex)) {
          throw new AppError('Invalid hex color format. Use format: #RRGGBB', 400);
        }
      }
    }

    const updated = await this.AttributeValue.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).populate('attribute', 'name displayName type');

    return updated!;
  }

  async deleteAttributeValue(id: string): Promise<void> {
    // TODO: Check if value is in use by any product variants
    // For now, we'll allow deletion
    const result = await this.AttributeValue.findByIdAndDelete(id);

    if (!result) {
      throw new AppError('Attribute value not found', 404);
    }
  }

  async bulkCreateAttributeValues(
    attributeId: string,
    values: string[]
  ): Promise<IAttributeValue[]> {
    // Verify attribute exists
    const attribute = await this.Attribute.findById(attributeId);
    if (!attribute) {
      throw new AppError('Attribute not found', 404);
    }

    // Get existing values to avoid duplicates
    const existingValues = await this.AttributeValue.find({
      attribute: attributeId,
    });
    const existingValueStrings = existingValues.map((v) => v.value);

    // Filter out duplicates
    const newValues = values.filter((v) => !existingValueStrings.includes(v));

    if (newValues.length === 0) {
      return [];
    }

    // Create attribute values
    const attributeValues = newValues.map((value, index) => ({
      attribute: attributeId,
      value,
      displayOrder: existingValues.length + index,
    }));

    const created = (await this.AttributeValue.insertMany(attributeValues)) as unknown as IAttributeValue[];

    return created;
  }
}
