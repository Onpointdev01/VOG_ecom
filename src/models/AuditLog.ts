import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { AUDIT_LOG, USER } = constants.mongooseModels;

export type EntityType = 'product' | 'bid' | 'order' | 'user' | 'seller' | 'payout' | 'bid_message';
export type ActionType = 'create' | 'update' | 'delete' | 'soft_delete' | 'accept' | 'reject' | 'cancel';

export interface IAuditLog extends Document {
  user_id: Schema.Types.ObjectId;
  action: ActionType;
  entity_type: EntityType;
  entity_id: string;
  before?: any; // JSON snapshot before change
  after?: any; // JSON snapshot after change
  ip?: string;
  user_agent?: string;
  metadata?: any; // Additional context
  createdAt: Date;
}

const auditLogSchema: Schema<IAuditLog> = new Schema<IAuditLog>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: USER,
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ['create', 'update', 'delete', 'soft_delete', 'accept', 'reject', 'cancel'],
      required: true,
      index: true,
    },
    entity_type: {
      type: String,
      enum: ['product', 'bid', 'order', 'user', 'seller', 'payout', 'bid_message'],
      required: true,
      index: true,
    },
    entity_id: {
      type: String,
      required: true,
      index: true,
    },
    before: {
      type: Schema.Types.Mixed,
      required: false,
    },
    after: {
      type: Schema.Types.Mixed,
      required: false,
    },
    ip: {
      type: String,
      required: false,
    },
    user_agent: {
      type: String,
      required: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
auditLogSchema.index({ entity_type: 1, entity_id: 1, createdAt: -1 });
auditLogSchema.index({ user_id: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, entity_type: 1, createdAt: -1 });

// Transform _id to id for API responses
auditLogSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const AuditLog: Model<IAuditLog> = model<IAuditLog>(AUDIT_LOG, auditLogSchema);

