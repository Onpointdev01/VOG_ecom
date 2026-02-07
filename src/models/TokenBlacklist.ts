import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { TOKEN_BLACKLIST } = constants.mongooseModels;

export interface ITokenBlacklist extends Document {
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

const tokenBlacklistSchema: Schema<ITokenBlacklist> = new Schema<ITokenBlacklist>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Auto-delete expired tokens
    },
  },
  { timestamps: true }
);

// Index for efficient lookups
tokenBlacklistSchema.index({ userId: 1, token: 1 });

export const TokenBlacklist: Model<ITokenBlacklist> = model<ITokenBlacklist>(
  TOKEN_BLACKLIST,
  tokenBlacklistSchema
);

