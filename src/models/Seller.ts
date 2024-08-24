import { Document, Model, model, Schema } from 'mongoose';
import constants from '../utils/constants';

const { SELLER } = constants.mongooseModels;

export interface ISeller extends Document {
  user: Schema.Types.ObjectId;
  type: string;
  products: Schema.Types.ObjectId[];
}

const sellerSchema: Schema = new Schema<ISeller>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['individual', 'company'], required: true },
  products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
});

export const Seller: Model<ISeller> = model<ISeller>(SELLER, sellerSchema);
