import mongoose, { Schema, Document } from 'mongoose';

export type NotificationType =
  | 'order'
  | 'offer'
  | 'bid'
  | 'message'
  | 'product'
  | 'account'
  | 'promotional'
  | 'system';

export type NotificationEntityType =
  | 'order'
  | 'offer'
  | 'message'
  | 'conversation'
  | 'product'
  | 'account';

export type NotificationTarget = 'buyer' | 'seller' | 'both';

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  type: NotificationType;
  target: NotificationTarget;
  title: string;
  message: string;
  body?: string;
  actionUrl?: string;
  link?: string;
  entityType?: NotificationEntityType;
  entityId?: string;
  conversationId?: mongoose.Types.ObjectId | string;
  dedupeKey?: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    target: {
      type: String,
      enum: ['buyer', 'seller', 'both'],
      default: 'buyer',
      index: true,
    },
    type: {
      type: String,
      enum: ['order', 'offer', 'bid', 'message', 'product', 'account', 'promotional', 'system'],
      required: true,
      default: 'system',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    body: {
      type: String,
    },
    actionUrl: {
      type: String,
    },
    link: {
      type: String,
    },
    entityType: {
      type: String,
      enum: ['order', 'offer', 'message', 'conversation', 'product', 'account'],
    },
    entityId: {
      type: String,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
    },
    dedupeKey: {
      type: String,
      sparse: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, isRead: 1 });
NotificationSchema.index(
  { user: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

export default mongoose.model<INotification>('Notification', NotificationSchema);
