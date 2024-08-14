import { Document, Model, model, Schema } from 'mongoose';
import validator from 'validator';
import constants from '../utils/constants';

const { USER } = constants.mongooseModels;

export interface ISocialLogin {
  provider: string;
  providerId: string;
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
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
  verified: boolean;
  verifyCode?: string;
  verifyCodeExpires?: Date;
  socialLogin: ISocialLogin[];
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
      required: [true, "User's first name is required"],
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
    nationality: {
      type: String,
    },
    currentLocation: {
      type: String,
    },
    socialLogin: [socialLoginSchema],
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
export const User: Model<IUser> = model<IUser>(USER, userSchema);
