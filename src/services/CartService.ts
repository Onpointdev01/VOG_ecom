import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import TYPES from '../di';
import { IBid, ICart, IOffer, IProduct, IUser, IProductVariant, IOrder } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import { AddToCartDTO, CartItemUpdateDTO, CartResponse, UpdateCartItemDTO } from '../utils/dtos';
import { toIdString } from '../utils/mongoId';
import { ProductAvailabilityService } from './ProductAvailabilityService';
import { isVariableProductType } from '../utils/productAvailability';

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
  addOfferToCart(userId: string, productId: string, offerAmount: number, size: string, color: string, offerId: string): Promise<ICart>;
  getCartByUserId(userId: string): Promise<CartResponse>;
  updateCartItem(userId: string, itemId: string, payload: UpdateCartItemDTO): Promise<ICart>;
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
    @inject(TYPES.Bid) private Bid: Model<IBid>,
    @inject(TYPES.Offer) private Offer: Model<IOffer>,
    @inject(TYPES.Order) private Order: Model<IOrder>,
    @inject(TYPES.ProductAvailabilityService)
    private productAvailability: ProductAvailabilityService
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
    const productId = toIdString(product._id ?? product.id);
    await this.productAvailability.assertPurchasable(productId, item.quantity + 1);

    let availableQuantity: number;

    if (product.productType === 'simple') {
      availableQuantity = product.quantityAvailable || 0;
    } else if (isVariableProductType(product.productType)) {
      // Find the specific variant for this cart item
      // Priority: SKU > size/color combination
      let variant;
      
      if (item.sku) {
        // Use SKU if available
        variant = await this.ProductVariant.findOne({
          product: product._id,
          sku: item.sku,
          isActive: true
        });
      } else {
        // Fall back to size/color combination
        variant = await this.ProductVariant.findOne({
          product: product._id,
          size: item.size,
          color: item.color,
          isActive: true
        });
      }
      
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
    const { user, productId, quantity, sku, size, color, variantId } = payload;

    await this.verifyUser(user);
    await this.productAvailability.assertPurchasable(productId, quantity);
    const product = await this.verifyProduct(productId);

    let price: number;
    let availableQuantity: number;
    let selectedVariant: IProductVariant | null = null;

    if (product.productType === 'simple') {
      // For simple products, use product-level pricing and stock
      // SKU, size, and color are not relevant for simple products
      if (sku) {
        throw new AppError('SKU is not applicable for simple products', 400);
      }

      price = product.price!;
      availableQuantity = product.quantityAvailable!;
    } else if (isVariableProductType(product.productType)) {
      selectedVariant = await this.resolveCartVariant(productId, { sku, variantId, size, color });

      if (quantity > (selectedVariant.quantityAvailable || 0)) {
        throw new AppError('Requested quantity exceeds available stock', 400);
      }

      price = selectedVariant.price;
      availableQuantity = selectedVariant.quantityAvailable;
    } else {
      throw new AppError('Invalid product type', 400);
    }

    // Check for an accepted offer (preferred) or legacy bid
    const acceptedOffer = await this.Offer.findOne({
      product: productId,
      buyer: user,
      status: 'ACCEPTED',
      expiresAt: { $gte: new Date() },
    });

    if (acceptedOffer) {
      price = acceptedOffer.amount;
    } else {
      const acceptedBid = await this.Bid.findOne({
        product: productId,
        buyer: user,
        status: 'ACCEPTED',
        expiresAt: { $gte: new Date() },
      });

      if (acceptedBid) {
        price = acceptedBid.bidPrice;
      }
    }

    const existingCart = await this.Cart.findOne({ user });

    if (existingCart) {
      // Optimized uniqueness logic based on product type
      const existingItem = existingCart.items.find((item) => {
        if (product.productType === 'simple') {
          // For simple products, only product ID matters (one variant per product)
          return item.product.toString() === productId;
        }
        if (!selectedVariant) return false;
        const itemVariantId = item.variantId?.toString();
        if (itemVariantId && itemVariantId === String(selectedVariant._id)) {
          return item.product.toString() === productId;
        }
        if (selectedVariant.sku && item.sku && item.sku === selectedVariant.sku) {
          return item.product.toString() === productId;
        }
        return (
          item.product.toString() === productId &&
          item.size === selectedVariant.size &&
          item.color === selectedVariant.color
        );
      });

      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity;

        if (availableQuantity < newQuantity) {
          throw new AppError('Requested quantity exceeds available stock', 400);
        }

        existingItem.quantity = newQuantity; // Update the quantity
      } else {
        // Add new item if not already in the cart
        const newItem: any = {
          product: product,
          quantity,
          price: price,
          _id: productId,
        };

        if (isVariableProductType(product.productType) && selectedVariant) {
          newItem.variantId = selectedVariant._id;
          newItem.sku = selectedVariant.sku;
          newItem.size = selectedVariant.size;
          newItem.color = selectedVariant.color;
        } else {
          // For simple products, don't store SKU (not applicable)
          // Store size and color only for display purposes
          newItem.size = 'One Size';
          newItem.color = product.color || 'Default';
        }

        existingCart.items.push(newItem);
      }

      // Save the cart to trigger the pre-save hook
      await existingCart.save();

      return existingCart;
    }

    // Create a new cart if it doesn't exist
    const newItem: any = {
      product: productId,
      quantity,
      price: price,
    };

    if (isVariableProductType(product.productType) && selectedVariant) {
      newItem.variantId = selectedVariant._id;
      newItem.sku = selectedVariant.sku;
      newItem.size = selectedVariant.size;
      newItem.color = selectedVariant.color;
    } else {
      // For simple products, don't store SKU (not applicable)
      // Store size and color only for display purposes
      newItem.size = 'One Size';
      newItem.color = product.color || 'Default';
    }

    const newCart = new this.Cart({
      user,
      items: [newItem],
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
    await this.productAvailability.assertPurchasable(productId, 1);
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
    } else if (isVariableProductType(product.productType)) {
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

  async addOfferToCart(
    userId: string,
    productId: string,
    offerAmount: number,
    size: string,
    color: string,
    offerId: string
  ): Promise<ICart> {
    await this.verifyUser(userId);
    await this.productAvailability.assertPurchasable(productId, 1);
    const product = await this.verifyProduct(productId);

    const offer = await this.Offer.findById(offerId);
    if (!offer) {
      throw new AppError('Offer not found', 404);
    }

    if (offer.status !== 'ACCEPTED' || toIdString(offer.buyer) !== userId) {
      throw new AppError('Invalid or unauthorized offer', 400);
    }

    if (offer.expiresAt && offer.expiresAt < new Date()) {
      throw new AppError('This offer has expired', 410);
    }

    if (product.productType === 'simple') {
      if (color && product.color && product.color !== color) {
        throw new AppError('Invalid color selected', 400);
      }
    } else if (isVariableProductType(product.productType)) {
      const variant = await this.ProductVariant.findOne({
        product: productId,
        size,
        color,
        isActive: true,
      });
      if (!variant) {
        throw new AppError('Product variant not found', 404);
      }
    }

    const existingCart = await this.Cart.findOne({ user: userId });

    if (existingCart) {
      const existingItem = existingCart.items.find(
        (item) =>
          item.product.toString() === productId &&
          (item.offerId?.toString() === offerId || (item as { offerId?: string }).offerId === offerId)
      );

      if (existingItem) {
        throw new AppError('This offer item is already in your cart', 400);
      }

      existingCart.items.push({
        product: productId as unknown as ICart['items'][0]['product'],
        quantity: 1,
        size,
        color,
        price: offerAmount,
        offerId: offerId as unknown as ICart['items'][0]['offerId'],
      } as ICart['items'][0]);

      await existingCart.save();
      return existingCart;
    }

    const newCart = new this.Cart({
      user: userId,
      items: [
        {
          product: productId,
          quantity: 1,
          size,
          color,
          price: offerAmount,
          offerId,
        },
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
        id: '',
        user: userId,
        items: [],
        totalPrice: 0,
        updatedAt: new Date(),
      };
    }

    // Get pending orders for this user (orders that aren't confirmed yet)
    const pendingOrders = await this.Order.find({
      user: userId,
      orderStatus: 'PENDING'
    }).select('cartItemIds items').lean();

    // Extract all cart item IDs that are in pending orders
    const pendingCartItemIds = new Set<string>();
    pendingOrders.forEach(order => {
      if (order.cartItemIds) {
        order.cartItemIds.forEach(id => pendingCartItemIds.add(id));
      }
    });

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
        sku: item.sku || '',
        size: item.size || '',
        color: item.color || '',
        variantId: item.variantId?.toString(),
        price: item.price,
        isPending: pendingCartItemIds.has(item._id.toString()), // Always include pending status
      })),
      totalPrice: cart.totalPrice,
      updatedAt: cart.updatedAt,
    };
  }

  async updateCartItem(userId: string, itemId: string, payload: UpdateCartItemDTO): Promise<ICart> {
    const { quantity, sku, size, color } = payload;

    // Verify cart exists and contains item
    const cart = await this.Cart.findOne({ user: userId, 'items._id': itemId }).populate('items.product');

    if (!cart) {
      throw new AppError('Cart or item not found', 404);
    }

    const item = cart.items.find((item) => item._id.toString() === itemId);
    if (!item) {
      throw new AppError('Item not found in cart', 404);
    }

    const product = item.product as IProduct;
    const updateFields: Record<string, any> = {};

    // Validate and update quantity if provided
    if (quantity !== undefined) {
      if (quantity < 1) {
        throw new AppError('Quantity must be at least 1', 400);
      }

      let availableQuantity: number;
      
      if (product.productType === 'simple') {
        availableQuantity = product.quantityAvailable || 0;
      } else if (isVariableProductType(product.productType)) {
        // For variable products, check the specific variant
        // Priority: SKU > size/color combination
        let variant;
        
        if (sku) {
          // Use SKU if provided
          variant = await this.ProductVariant.findOne({
            product: product._id,
            sku,
            isActive: true
          });
        } else {
          // Fall back to size/color combination
          variant = await this.ProductVariant.findOne({
            product: product._id,
            size: size || item.size,
            color: color || item.color,
            isActive: true
          });
        }
        
        if (!variant) {
          throw new AppError('Product variant not found', 404);
        }
        
        availableQuantity = variant.quantityAvailable || 0;
      } else {
        throw new AppError('Invalid product type', 400);
      }

      if (availableQuantity < quantity) {
        throw new AppError('Requested quantity exceeds available stock', 400);
      }
      
      updateFields['items.$.quantity'] = quantity;
    }

    // Validate and update SKU if provided (only for variable products)
    if (sku !== undefined) {
      if (product.productType === 'simple') {
        throw new AppError('SKU updates are not applicable for simple products', 400);
      }
      
      // Check if variant exists with new SKU
      const variant = await this.ProductVariant.findOne({
        product: product._id,
        sku: sku,
        isActive: true
      });
      
      if (!variant) {
        throw new AppError('Product variant with selected SKU not found', 404);
      }
      
      updateFields['items.$.sku'] = sku;
      updateFields['items.$.size'] = variant.size;
      updateFields['items.$.color'] = variant.color;
      updateFields['items.$.price'] = variant.price;
    }

    // Validate and update size if provided (only for variable products)
    // Note: This is a fallback when SKU is not provided
    if (size !== undefined && sku === undefined) {
      if (product.productType === 'simple') {
        throw new AppError('Size updates are not applicable for simple products (they have fixed attributes)', 400);
      }
      
      // Check if variant exists with new size and current/new color
      const variant = await this.ProductVariant.findOne({
        product: product._id,
        size: size,
        color: color || item.color,
        isActive: true
      });
      
      if (!variant) {
        throw new AppError('Product variant with selected size and color not found', 404);
      }
      
      updateFields['items.$.sku'] = variant.sku;
      updateFields['items.$.size'] = size;
      updateFields['items.$.price'] = variant.price;
    }

    // Validate and update color if provided (only for variable products)
    // Note: This is a fallback when SKU is not provided
    if (color !== undefined && sku === undefined) {
      if (product.productType === 'simple') {
        throw new AppError('Color updates are not applicable for simple products (they have fixed attributes)', 400);
      }
      
      // Check if variant exists with current/new size and new color
      const variant = await this.ProductVariant.findOne({
        product: product._id,
        size: size || item.size,
        color: color,
        isActive: true
      });
      
      if (!variant) {
        throw new AppError('Product variant with selected size and color not found', 404);
      }
      
      updateFields['items.$.sku'] = variant.sku;
      updateFields['items.$.color'] = color;
      updateFields['items.$.price'] = variant.price;
    }

    // Update cart item
    const updatedCart = await this.Cart.findOneAndUpdate(
      { user: userId, 'items._id': itemId },
      { $set: updateFields },
      { new: true }
    ).populate('items.product', 'name images price');

    if (!updatedCart) {
      throw new AppError('Failed to update cart item', 500);
    }

    return updatedCart;
  }

  async removeCartItem(userId: string, itemId: string): Promise<ICart> {
    // Find the cart first
    const cart = await this.Cart.findOne({ user: userId });

    if (!cart) {
      throw new AppError('Cart not found', 404);
    }

    // Check if item exists in cart
    const itemIndex = cart.items.findIndex((item) => item._id.toString() === itemId);
    if (itemIndex === -1) {
      throw new AppError('Item not found in cart', 404);
    }

    // Remove the item from the array
    cart.items.splice(itemIndex, 1);

    // Save the cart to trigger pre-save hook for totalPrice recalculation
    await cart.save();

    // Populate and return the updated cart
    await cart.populate('items.product', 'name images price sizes color');

    return cart;
  }

  async clearCart(userId: string): Promise<void> {
    const result = await this.Cart.findOneAndDelete({ user: userId });
    if (!result) {
      throw new AppError('Cart not found', 404);
    }
  }


  private async resolveCartVariant(
    productId: string,
    opts: { sku?: string; variantId?: string; size?: string; color?: string }
  ): Promise<IProductVariant> {
    let variant: IProductVariant | null = null;

    if (opts.variantId) {
      variant = await this.ProductVariant.findOne({
        _id: opts.variantId,
        product: productId,
        isActive: true,
      });
    } else if (opts.sku) {
      variant = await this.ProductVariant.findOne({
        product: productId,
        sku: opts.sku,
        isActive: true,
      });
    } else if (opts.size || opts.color) {
      const query: Record<string, unknown> = {
        product: productId,
        isActive: true,
      };
      if (opts.size) query.size = opts.size;
      if (opts.color) query.color = opts.color;
      variant = await this.ProductVariant.findOne(query);
    } else {
      throw new AppError('SKU, variantId, or size/color are required for variable products', 400);
    }

    if (!variant) {
      throw new AppError('Product variant not found or not available', 404);
    }

    if ((variant.quantityAvailable || 0) < 1) {
      throw new AppError('Selected variant is out of stock', 400);
    }

    return variant;
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
    if (!mongoose.isValidObjectId(productId)) {
      throw new AppError('Invalid product ID format', 400);
    }
    const product = await this.Product.findById(productId);
    if (!product) {
      throw new AppError('Product not found', 404);
    }
    return product;
  }
}
