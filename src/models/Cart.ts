import { Document, Model, model, Schema } from 'mongoose';

import PRODUCT from '../utils/constants';
interface ICartItem {
  product: Schema.Types.ObjectId;
  quantity: number;
  price: number;
  isBidItem: boolean;
  bid?: Schema.Types.ObjectId;
}

export interface ICart extends Document {
  user: Schema.Types.ObjectId;
  items: ICartItem[];
  totalAmount: number;
}

const cartItemSchema = new Schema<ICartItem>({
  product: { type: Schema.Types.ObjectId, ref: PRODUCT, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
  isBidItem: { type: Boolean, default: false },
  bid: { type: Schema.Types.ObjectId, ref: 'Bid' },
});

const cartSchema: Schema<ICart> = new Schema<ICart>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [cartItemSchema],
    totalAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

cartSchema.pre('save', function (next) {
  this.totalAmount = this.items.reduce((total, item) => total + item.price * item.quantity, 0);
  next();
});

export const Cart: Model<ICart> = model<ICart>('Cart', cartSchema);
