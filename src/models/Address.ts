import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { USER, ADDRESS } = constants.mongooseModels;
export interface IAddress extends Document {
  user: Schema.Types.ObjectId;
  fullName: string;
  phoneNumber: string;
  homeAddress: string;
  state: string;
  city: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

const AddressSchema: Schema = new Schema<IAddress>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: USER,
      required: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    homeAddress: {
      type: String,
      required: [true, 'Home address is required'],
      trim: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    postalCode: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
      default: 'Congo', // Assuming Nigeria is the default
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Transform _id to id for API responses
AddressSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Address: Model<IAddress> = model<IAddress>(ADDRESS, AddressSchema);
