import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IBid, ICart, IProduct, IUser, IProductVariant } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import { AddToCartDTO, CartItemUpdateDTO, CartResponse } from '../utils/dtos';

// Helper to safely get buyer ID from bid
function getBuyerId(bid: IBid): string {
  if (bid.buyer && typeof bid.buyer === 'object' && (bid.buyer as IUser)._id) {
    return ((bid.buyer as IUser)._id as string).toString();
  }
  if (bid.buyer) {
    return bid.buyer.toString();
  }
  throw new Error('Bid buyer is required');
}

export interface ICartService {
  decreaseItemQuantity(userID: string, itemId: string): Promise<CartItemUpdateDTO>;
  increaseItemQuantity(userID: string, itemId: string): Promise<CartItemUpdateDTO>;
  addToCart(payload: AddToCartDTO): Promise<ICart>;
  addBidToCart(userId: string, productId: string, bidPrice: number, size: string, color: string, bidId: string): Promise<ICart>;
  getCartByUserId(userId: string): Promise<CartResponse>;
  // updateCartItem(userId: string, itemId: string, payload: UpdateCartItemDTO): Promise<ICart>;
  removeCartItem(userId: string, itemId: string): Promise<ICart>;
  clearCart(userId: string): Promise<void>;
}

@injectable()
export class CartService extends BaseService implements ICartService {
  constructor(
    @inject(TYPES.Cart) private Cart: Model<ICart>,
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.ProductVariant) private ProductVariant: Model<IProductVariant>,
    @inject(TYPES.Bid) private Bid: Model<IBid>
  ) {
    super();
  }
  async decreaseItemQuantity(userID: string, itemId: string): Promise<CartItemUpdateDTO> {
    const cart = await this.Cart.findOne({ user: userID, 'items._id': itemId });

    if (!cart) {
      throw new AppError('Cart or item not found', 404);
    }

    const item = cart.items.find((item) => item._id.toString() === itemId);
    if (!item) {
      throw new AppError('Item not found in cart', 404);
    }

    if (item.quantity <= 1) {
      throw new AppError('Item quantity cannot be less than 1', 400);
    }

    item.quantity -= 1;
    await cart.save();

    return {
      quantity: item.quantity,
      price: item.price,
      totalPrice: cart.totalPrice,
    };
  }

  async increaseItemQuantity(userID: string, itemId: string): Promise<CartItemUpdateDTO> {
    console.log('user id: ', userID, 'item id: ', itemId);
    const cart = await this.Cart.findOne({ user: userID, 'items._id': itemId }).populate('items.product');

    if (!cart) {
      throw new AppError('Cart or item not found', 404);
    }

    const item = cart.items.find((item) => item._id.toString() === itemId);
    if (!item) {
      throw new AppError('Item not found in cart', 404);
    }

    const product = item.product as IProduct;
    let availableQuantity: number;

    if (product.productType === 'simple') {
      availableQuantity = product.quantityAvailable || 0;
    } else if (product.productType === 'variable') {
      // Find the specific variant for this cart item
      const variant = await this.ProductVariant.findOne({
        product: product._id,
        size: item.size,
        color: item.color,
        isActive: true
      });
      availableQuantity = variant?.quantityAvailable || 0;
    } else {
      throw new AppError('Invalid product type', 400);
    }

    if (availableQuantity < item.quantity + 1) {
      throw new AppError('Requested quantity exceeds available stock', 400);
    }

    item.quantity += 1;
    await cart.save();

    return {
      quantity: item.quantity,
      price: item.price,
      totalPrice: cart.totalPrice,
    };
  }

  async addToCart(payload: AddToCartDTO): Promise<ICart> {
    const { user, productId, quantity, size, color, variantId } = payload;

    await this.verifyUser(user);
    const product = await this.verifyProduct(productId);

    let price: number;
    let availableQuantity: number;

    if (product.productType === 'simple') {
      // For simple products, size and color are fixed in the product
      // Optional validation if provided
      if (color && product.color && product.color !== color) {
        throw new AppError('Invalid color selected', 400);
      }

      price = product.price!;
      availableQuantity = product.quantityAvailable!;
    } else if (product.productType === 'variable') {
      // For variable products, we need a specific variant
      if (!variantId && (!size || !color)) {
        throw new AppError('Size and color are required for variable products, or provide variantId', 400);
      }

      let variant;
      if (variantId) {
        variant = await this.ProductVariant.findById(variantId);
      } else {
        variant = await this.ProductVariant.findOne({
          product: productId,
          size,
          color,
          isActive: true
        });
      }

      if (!variant) {
        throw new AppError('Product variant not found or not available', 404);
      }

      price = variant.price;
      availableQuantity = variant.quantityAvailable;
    } else {
      throw new AppError('Invalid product type', 400);
    }

    // Check for an accepted bid
    const acceptedBid = await this.Bid.findOne({
      product: productId,
      buyer: user,
      status: 'ACCEPTED',
      expiresAt: { $gte: new Date() },
    });

    if (acceptedBid) {
      price = acceptedBid.bidPrice;
    }

    const existingCart = await this.Cart.findOne({ user });

    if (existingCart) {
      const existingItem = existingCart.items.find(
        (item) => item.product.toString() === productId && item.size === size && item.color === color
      );

      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity;

        if (availableQuantity < newQuantity) {
          throw new AppError('Requested quantity exceeds available stock', 400);
        }

        existingItem.quantity = newQuantity; // Update the quantity
      } else {
        // Add new item if not already in the cart
        existingCart.items.push({
          product: product,
          quantity,
          size: size || (product.productType === 'simple' ? 'One Size' : undefined),
          color: color || (product.productType === 'simple' ? product.color : undefined),
          price: price,
          _id: productId,
        });
      }

      // Save the cart to trigger the pre-save hook
      await existingCart.save();

      return existingCart;
    }

    // Create a new cart if it doesn't exist
    const newCart = new this.Cart({
      user,
      items: [
        {
          product: productId,
          quantity,
          size: size || (product.productType === 'simple' ? 'One Size' : undefined),
          color: color || (product.productType === 'simple' ? product.color : undefined),
          price: price,
        },
      ],
    });

    await newCart.save();

    return newCart;
  }

  async addBidToCart(
    userId: string, 
    productId: string, 
    bidPrice: number, 
    size: string, 
    color: string, 
    bidId: string
  ): Promise<ICart> {
    await this.verifyUser(userId);
    const product = await this.verifyProduct(productId);

    // Verify the bid exists and is accepted
    const bid = await this.Bid.findById(bidId);
    if (!bid) {
      throw new AppError('Bid not found', 404);
    }
    
    const bidBuyerId = getBuyerId(bid);
      
    if (bid.status !== 'ACCEPTED' || bidBuyerId !== userId) {
      throw new AppError('Invalid or unauthorized bid', 400);
    }

    // Validate size and color based on product type
    if (product.productType === 'simple') {
      if (color && product.color && product.color !== color) {
        throw new AppError('Invalid color selected', 400);
      }
    } else if (product.productType === 'variable') {
      // For variable products, check if variant exists
      const variant = await this.ProductVariant.findOne({
        product: productId,
        size,
        color,
        isActive: true
      });
      if (!variant) {
        throw new AppError('Product variant not found', 404);
      }
    }

    const existingCart = await this.Cart.findOne({ user: userId });

    if (existingCart) {
      // Check if this exact bid product is already in cart
      const existingItem = existingCart.items.find(
        (item) => item.product.toString() === productId && 
                  (item as any).bidId === bidId // Track the specific bid
      );

      if (existingItem) {
        throw new AppError('This bid item is already in your cart', 400);
      }

      // Add new bid item to cart
      existingCart.items.push({
        product: productId as any,
        quantity: 1, // Bid items are always quantity 1
        size,
        color,
        price: bidPrice,
        _id: productId as any,
        // Add bid reference for tracking
        ...(bidId && { bidId })
      } as any);

      await existingCart.save();
      return existingCart;
    }

    // Create a new cart if it doesn't exist
    const newCart = new this.Cart({
      user: userId,
      items: [
        {
          product: productId,
          quantity: 1,
          size,
          color,
          price: bidPrice,
          // Add bid reference
          ...(bidId && { bidId })
        } as any,
      ],
    });

    await newCart.save();
    return newCart;
  }

  async getCartByUserId(userId: string): Promise<CartResponse> {
    await this.verifyUser(userId);

    const cart = await this.Cart.findOne({ user: userId })
      .populate('items.product', 'name images price sizes color')
      .lean();

    if (!cart) {
      return {
        id: '', // Can be set to null or undefined
        user: userId,
        items: [], // Return empty array to indicate no items in the cart
        totalPrice: 0, // Total price is 0 for an empty cart
        updatedAt: new Date(), // Current date as a fallback
      };
    }
    console.log('cart: ', cart);
    return {
      id: cart._id.toString(),
      user: cart.user.toString(),
      items: cart.items.map((item) => ({
        id: item._id,
        product: {
          id: ((item.product as IProduct)._id as any).toString(),
          name: (item.product as IProduct).name,
          images: (item.product as IProduct).images || [],
          price: (item.product as IProduct).price || 0,
        },
        quantity: item.quantity,
        size: item.size || '',
        color: item.color || '',
        price: item.price,
      })),
      totalPrice: cart.totalPrice,
      updatedAt: cart.updatedAt,
    };
  }

  // async updateCartItem(userId: string, itemId: string, payload: UpdateCartItemDTO): Promise<ICart> {
  //   const { quantity, size, color } = payload;

  //   // Verify cart exists and contains item
  //   const cart = await this.Cart.findOne({ user: userId, 'items._id': itemId }).populate(
  //     'items.product',
  //     'quantityAvailable sizes color'
  //   );

  //   if (!cart) {
  //     throw new AppError('Cart or item not found', 404);
  //   }

  //   const item = cart.items.find((item) => item._id.toString() === itemId);
  //   if (!item) {
  //     throw new AppError('Item not found in cart', 404);
  //   }

  //   const product = item.product as IProduct;

  //   const updateFields: Record<string, any> = {};

  //   // Validate and update quantity if provided
  //   if (quantity !== undefined) {
  //     if (product.quantityAvailable < quantity) {
  //       throw new AppError('Requested quantity not available', 400);
  //     }
  //     updateFields['items.$.quantity'] = quantity;
  //   }

  //   // Validate and update size if provided
  //   if (size !== undefined) {
  //     if (!product.sizes.includes(size)) {
  //       throw new AppError('Invalid size selected', 400);
  //     }
  //     updateFields['items.$.size'] = size;
  //   }

  //   // Validate and update color if provided
  //   if (color !== undefined) {
  //     if (product.color !== color) {
  //       throw new AppError('Invalid color selected', 400);
  //     }
  //     updateFields['items.$.color'] = color;
  //   }

  //   // Update cart item
  //   const updatedCart = await this.Cart.findOneAndUpdate(
  //     { user: userId, 'items._id': itemId },
  //     { $set: updateFields },
  //     { new: true }
  //   ).populate('items.product', 'name images price sizes color');

  //   return updatedCart;
  // }

  async removeCartItem(userId: string, itemId: string): Promise<ICart> {
    const cart = await this.Cart.findOneAndUpdate(
      { user: userId },
      { $pull: { items: { _id: itemId } } },
      { new: true }
    ).populate('items.product', 'name images price sizes color');

    if (!cart) {
      throw new AppError('Cart or item not found', 404);
    }

    return cart;
  }

  async clearCart(userId: string): Promise<void> {
    const result = await this.Cart.findOneAndDelete({ user: userId });
    if (!result) {
      throw new AppError('Cart not found', 404);
    }
  }

  // Private methods
  private async verifyUser(userId: string): Promise<IUser> {
    const user = await this.User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  }

  private async verifyProduct(productId: string): Promise<IProduct> {
    const product = await this.Product.findById(productId);
    if (!product) {
      throw new AppError('Product not found', 404);
    }
    return product;
  }
}
