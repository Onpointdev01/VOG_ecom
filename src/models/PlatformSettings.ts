import { Schema, Document, Model, model } from 'mongoose';

export type OrderApprovalMode = 'ADMIN_ONLY' | 'SELLER_ALLOWED';

const SETTINGS_DOC_ID = 'platform';

export interface IPlatformSettings extends Document {
  _id: string;
  orderApprovalMode: OrderApprovalMode;
  updatedAt: Date;
}

const platformSettingsSchema = new Schema<IPlatformSettings>(
  {
    _id: { type: String, default: SETTINGS_DOC_ID },
    orderApprovalMode: {
      type: String,
      enum: ['ADMIN_ONLY', 'SELLER_ALLOWED'],
      default: 'ADMIN_ONLY',
      required: true,
    },
  },
  { timestamps: { createdAt: false, updatedAt: true }, _id: false }
);

export const PlatformSettings: Model<IPlatformSettings> = model<IPlatformSettings>(
  'PlatformSettings',
  platformSettingsSchema
);

export const PLATFORM_SETTINGS_ID = SETTINGS_DOC_ID;
