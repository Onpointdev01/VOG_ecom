import { Schema, Document, Model, model } from 'mongoose';
import mongoose from 'mongoose';
import { IProduct } from './Product';
import constants from '../utils/constants';
import { IUser } from './User';

const { CART, PRODUCT, USER } = constants.mongooseModels;

export interface ICartItem {
  _id: string;
  product: Schema.Types.ObjectId | IProduct;
  quantity: number;
  sku?: string; // SKU for variable products (more reliable than size/color)
  size?: string; // Optional for simple products or display purposes
  color?: string; // Optional for simple products or display purposes
  price: number;
  bidId?: Schema.Types.ObjectId; // Optional bid reference for bid-based purchases
}

export interface ICart extends Document {
  user: Schema.Types.ObjectId | IUser; // Link to the user
  items: ICartItem[];
  totalPrice: number;
  updatedAt: Date;
}

const cartItemSchema: Schema<ICartItem> = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: PRODUCT,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  sku: {
    type: String,
    required: false,
  },
  size: {
    type: String,
    required: false,
  },
  color: {
    type: String,
    required: false,
  },
  bidId: {
    type: Schema.Types.ObjectId,
    ref: 'Bid',
    required: false,
  },
});

const cartSchema: Schema<ICart> = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: USER,
    required: true,
  },
  items: [cartItemSchema],
  totalPrice: {
    type: Number,
    default: 0,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save middleware to calculate total price
cartSchema.pre('save', async function (next) {
  const cart = this as ICart;
  let total = 0;
  console.log('in here');

  for (const item of cart.items) {
    if (!mongoose.isValidObjectId(item.product)) {
      console.error(`Invalid ObjectId: ${item.product}`);
      continue;
    }
    const product = await model(PRODUCT).findById(item.product);
    if (product) {
      total += product.price * item.quantity;
    }
  }

  cart.totalPrice = total;
  next();
});

// Transform _id to id for API responses
cartSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// Transform _id to id for cart items
cartItemSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Cart: Model<ICart> = model<ICart>(CART, cartSchema);
