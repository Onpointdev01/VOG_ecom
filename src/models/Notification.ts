import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  type: 'order' | 'bid' | 'product' | 'account' | 'promotional';
  title: string;
  message: string;
  body?: string; // For backwards compatibility with push notifications
  data?: any; // Additional data (orderId, productId, etc.)
  link?: string; // Deep link to navigate to
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
    type: {
      type: String,
      enum: ['order', 'bid', 'product', 'account', 'promotional'],
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

// Indexes for efficient queries
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, isRead: 1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
