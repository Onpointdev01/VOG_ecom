import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { ICart, IProduct, IUser } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import { addToCartDTO, updateCartItemDTO } from '../utils/dtos';

export interface ICartService {
  addToCart(payload: addToCartDTO): Promise<ICart>;
  //   getCartByUserId(userId: string): Promise<cartResponse>;
  updateCartItem(userId: string, itemId: string, payload: updateCartItemDTO): Promise<ICart>;
  removeCartItem(userId: string, itemId: string): Promise<ICart>;
  clearCart(userId: string): Promise<void>;
}

@injectable()
export class CartService extends BaseService implements ICartService {
  constructor(
    @inject(TYPES.Cart) private Cart: Model<ICart>,
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Product) private Product: Model<IProduct>
  ) {
    super();
  }

  async addToCart(payload: addToCartDTO): Promise<ICart> {
    const { user, productId, quantity, bidId } = payload;
    await this.verifyUser(user);
    const product = await this.verifyProduct(productId);

    let price = product.price;
    let isBidItem = false;

    if (bidId) {
      const bid = await this.verifyBid(bidId);
      if (bid.status !== 'accepted') throw new AppError('Bid not accepted', 400);
      price = bid.amount;
      isBidItem = true;
    }

    const cart = await this.Cart.findOneAndUpdate(
      { user: user },
      {
        $push: {
          items: {
            product: productId,
            quantity,
            price,
            isBidItem,
            bid: bidId,
          },
        },
      },
      { new: true, upsert: true }
    );

    return cart;
  }

  //   async getCartByUserId(userId: string): Promise<cartResponse> {
  //     await this.verifyUser(userId);
  //     const cart = await this.Cart.findOne({ user: userId }).populate('items.product', 'name images price').lean();

  //     if (!cart) throw new AppError('Cart not found', 404);

  //     return {
  //       // _id: cart._id,
  //       user: cart.user,
  //       items: cart.items.map((item) => ({
  //         // _id: item._id,
  //         product: item.product,
  //         quantity: item.quantity,
  //         price: item.price,
  //         isBidItem: item.isBidItem,
  //         bid: item.bid,
  //       })),
  //       totalAmount: cart.totalAmount,
  //     };
  //   }

  async updateCartItem(userId: string, itemId: string, payload: updateCartItemDTO): Promise<ICart> {
    const { quantity } = payload;
    const cart = await this.Cart.findOneAndUpdate(
      { user: userId, 'items._id': itemId },
      { $set: { 'items.$.quantity': quantity } },
      { new: true }
    );

    if (!cart) throw new AppError('Cart or item not found', 404);

    return cart;
  }

  async removeCartItem(userId: string, itemId: string): Promise<ICart> {
    const cart = await this.Cart.findOneAndUpdate(
      { user: userId },
      { $pull: { items: { _id: itemId } } },
      { new: true }
    );

    if (!cart) throw new AppError('Cart or item not found', 404);

    return cart;
  }

  async clearCart(userId: string): Promise<void> {
    const result = await this.Cart.findOneAndDelete({ user: userId });
    if (!result) throw new AppError('Cart not found', 404);
  }

  // Private methods
  private async verifyUser(userId: string) {
    return await this.verifyDoc(userId, this.User);
  }

  private async verifyProduct(productId: string) {
    return await this.verifyDoc(productId, this.Product);
  }

  private async verifyBid(bidId: string) {
    // Assuming you have a Bid model, you would inject it in the constructor
    // and use it here. For now, we'll just return a mock bid.
    console.log('Verifying bid', bidId);
    return { status: 'accepted', amount: 100 };
  }
}
