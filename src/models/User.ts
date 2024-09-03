import { Document, Model, model, PopulatedDoc, Schema } from 'mongoose';
import validator from 'validator';
import constants from '../utils/constants';
import { ISeller } from './';

const { USER, SELLER } = constants.mongooseModels;

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
  role: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
  verified: boolean;
  verifyCode?: string;
  verifyCodeExpires?: Date;
  refreshToken?: string;
  socialLogin: ISocialLogin[];
  seller?: PopulatedDoc<ISeller>;
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
    seller: {
      type: Schema.Types.ObjectId,
      ref: SELLER,
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

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
