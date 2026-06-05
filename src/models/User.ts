import { Document, Model, model, PopulatedDoc, Schema } from 'mongoose';
import validator from 'validator';
import constants from '../utils/constants';
import { ISeller } from './';

const { USER, SELLER, PRODUCT } = constants.mongooseModels;

export interface ISocialLogin {
  provider: string;
  providerId: string;
}

export interface IOfferBan {
  isBanned: boolean;
  reason?: string | null;
  bannedAt?: Date | null;
  expiresAt?: Date | null;
  unbannedAt?: Date | null;
}

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  profileImageUrl: string;
  nationality: string;
  phoneNumber: string;
  currentLocation: string;
  role: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
  offerBan?: IOfferBan;
  /** @deprecated Use offerBan */
  bidBan?: IOfferBan;
  verified: boolean;
  verifyCode?: string;
  verifyCodeExpires?: Date;
  refreshToken?: string;
  socialLogin: ISocialLogin[];
  firebaseUid?: string;
  seller?: PopulatedDoc<ISeller>;
  wishlist: Schema.Types.ObjectId[]; // Array of product IDs for the wishlist
  pushTokens: string[]; // Array of Expo push tokens for notifications
  createdAt: Date;
  updatedAt: Date;
}

const socialLoginSchema: Schema = new Schema<ISocialLogin>(
  {
    provider: {
      type: String,
      required: true,
      enum: ['google', 'facebook', 'apple'], // Add or remove providers as needed
    },
    providerId: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const userSchema: Schema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      trim: true,
      required: [true, 'firstname is required'],
    },
    lastName: {
      type: String,
      trim: true,
      required: [true, 'lastname is required'],
    },
    email: {
      type: String,
      unique: true,
      validate: [validator.isEmail, 'Email is invalid'],
      required: [true, 'Email address is required'],
    },
    password: {
      type: String,
      select: false,
      required: false,
    },
    profileImageUrl: {
      type: String,
      default: 'https://ui-avatars.com/api/?name=New+User',
    },
    nationality: {
      type: String,
    },
    phoneNumber: {
      type: String,
      validate: [validator.isMobilePhone, 'Invalid phone number'],
    },
    currentLocation: {
      type: String,
    },
    role: {
      type: String,
      enum: ['user', 'seller', 'admin'],
      default: 'user',
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    banned: {
      type: Boolean,
      default: false,
    },
    banReason: {
      type: String,
      default: null,
    },
    banExpires: {
      type: Date,
      default: null,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    verifyCode: {
      type: String,
    },
    verifyCodeExpires: {
      type: Date,
    },
    refreshToken: {
      type: String,
    },

    socialLogin: [socialLoginSchema],
    firebaseUid: { type: String, sparse: true, index: true },
    seller: {
      type: Schema.Types.ObjectId,
      ref: SELLER,
    },
    wishlist: [
      {
        type: Schema.Types.ObjectId,
        ref: PRODUCT, // Reference to the Product model
      },
    ],
    pushTokens: [
      {
        type: String,
      },
    ],
    offerBan: {
      isBanned: { type: Boolean, default: false },
      reason: { type: String, default: null },
      bannedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      unbannedAt: { type: Date, default: null },
    },
    bidBan: {
      isBanned: { type: Boolean, default: false },
      reason: { type: String, default: null },
      bannedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      unbannedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

// Transform _id to id for API responses
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

userSchema.pre('save', function (next) {
  if (this.isModified('firstName') || this.isModified('lastName') || !this.profileImageUrl) {
    const firstName = this.firstName || '';
    const lastName = this.lastName || '';
    const name = `${firstName}+${lastName}`;
    this.profileImageUrl = `https://ui-avatars.com/api/?background=random&name=${name}`;
  }
  next();
});

export const User: Model<IUser> = model<IUser>(USER, userSchema);
