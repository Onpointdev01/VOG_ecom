import mongoose, { Schema, Document } from 'mongoose';

export type NotificationChannel = 'websocket' | 'push' | 'email' | 'in-app';

export interface INotification extends Document {
  user?: mongoose.Types.ObjectId; // Optional - for regular users
  adminId?: mongoose.Types.ObjectId; // Optional - for admin users
  type: 'order' | 'bid' | 'product' | 'account' | 'promotional' | 'admin_message';
  title: string;
  message: string;
  body?: string; // For backwards compatibility with push notifications
  payload?: any; // JSON payload for structured data
  data?: any; // Additional data (orderId, productId, etc.) - kept for backward compatibility
  link?: string; // Deep link to navigate to
  channel: NotificationChannel; // Channel through which notification was sent
  isRead: boolean;
  readAt?: Date; // When notification was read
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Made optional to support admin notifications
      index: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: false, // For admin notifications
      index: true,
    },
    type: {
      type: String,
      enum: ['order', 'bid', 'product', 'account', 'promotional', 'admin_message'],
      required: true,
      default: 'account',
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
      type: String, // Alias for message for push notification compatibility
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    link: {
      type: String, // Deep link or route path
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    channel: {
      type: String,
      enum: ['websocket', 'push', 'email', 'in-app'],
      default: 'in-app',
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, isRead: 1 });
NotificationSchema.index({ adminId: 1, createdAt: -1 });
NotificationSchema.index({ adminId: 1, isRead: 1 });
// Ensure either user or adminId is provided
NotificationSchema.pre('validate', function(next) {
  if (!this.user && !this.adminId) {
    return next(new Error('Either user or adminId must be provided'));
  }
  next();
});

export default mongoose.model<INotification>('Notification', NotificationSchema);
