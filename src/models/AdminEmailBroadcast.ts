import { Document, Model, Schema, model } from 'mongoose';
import constants from '../utils/constants';

const { ADMIN_EMAIL_BROADCAST, ADMIN } = constants.mongooseModels;

export type EmailAudience = 'buyers' | 'sellers' | 'everyone';

export interface IAdminEmailBroadcast extends Document {
  admin: Schema.Types.ObjectId;
  audience: EmailAudience;
  subject: string;
  text?: string;
  html: string;
  total: number;
  sent: number;
  failed: number;
  failures?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const adminEmailBroadcastSchema = new Schema<IAdminEmailBroadcast>(
  {
    admin: { type: Schema.Types.ObjectId, ref: ADMIN, required: true, index: true },
    audience: {
      type: String,
      enum: ['buyers', 'sellers', 'everyone'],
      required: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 500 },
    text: { type: String, trim: true, maxlength: 50000 },
    html: { type: String, required: true, maxlength: 100000 },
    total: { type: Number, required: true, min: 0 },
    sent: { type: Number, required: true, min: 0 },
    failed: { type: Number, required: true, min: 0 },
    failures: [{ type: String }],
  },
  { timestamps: true }
);

adminEmailBroadcastSchema.index({ createdAt: -1 });

export const AdminEmailBroadcast: Model<IAdminEmailBroadcast> = model<IAdminEmailBroadcast>(
  ADMIN_EMAIL_BROADCAST,
  adminEmailBroadcastSchema
);
