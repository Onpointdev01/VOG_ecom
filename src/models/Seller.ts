import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { SELLER } = constants.mongooseModels;

export interface ISeller extends Document {
  user: Schema.Types.ObjectId; // Reference to the user model
  type: string; // 'individual' or 'company'
  name: string; // Name of the seller or brand
  logo: string; // URL to the seller's logo image
  rating: number; // Average rating of the seller
  official: boolean; // Whether the seller is an official store
  status: string; // Status of the seller (e.g., 'active', 'suspended')
  products: Schema.Types.ObjectId[]; // List of products sold by the seller
  createdAt: Date;
  updatedAt: Date;
}

const sellerSchema: Schema<ISeller> = new Schema<ISeller>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['individual', 'company'], required: true },
    name: { type: String, required: true },
    logo: { type: String, default: '' },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    official: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'suspended', ''], default: 'active' },
    products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt fields
  }
);

// Creating the Seller model
export const Seller: Model<ISeller> = model<ISeller>(SELLER, sellerSchema);
