import { Document, Model, model, Schema } from 'mongoose';
import validator from 'validator';
import constants from '../utils/constants';

const { USER } = constants.mongooseModels;

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
}

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
      required: [true, 'Password is required'],
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
  },
  { timestamps: true }
);

export const User: Model<IUser> = model<IUser>(USER, userSchema);
