import { inject } from 'inversify';
import { controller, httpDelete, httpGet, httpPatch, httpPost, httpPut, requestBody, requestParam, response } from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import { ICartService } from '../services';
import { BaseController } from './BaseController';
import { AddToCartDTO, UpdateCartItemDTO } from '../utils/dtos';

@controller('/api/v1/carts')
export class CartController extends BaseController {
  constructor(@inject(TYPES.CartService) private cartService: ICartService) {
    super();
  }

  //get users cart
  @httpGet('/', TYPES.RequireSignIn)
  public async getUsersCart(@response() res: Response) {
    const userID = res.locals.user;

    const cart = await this.cartService.getCartByUserId(userID);
    return this.sendResponse(res, 200, 'cart fetched successfully', cart);
  }

  //add to cart
  @httpPost('/', TYPES.RequireSignIn)
  public async addToCart(@response() res: Response, @requestBody() payload: AddToCartDTO) {
    const userID = res.locals.user;
    payload.user = userID;

    const cart = await this.cartService.addToCart(payload);
    return this.sendResponse(res, 200, 'added to cart', cart);
  }

  //increase item quantity
  @httpPatch('/increase/:itemId', TYPES.RequireSignIn)
  public async increaseItemQuantity(@response() res: Response, @requestParam('itemId') itemId: string) {
    const userID = res.locals.user;

    const cart = await this.cartService.increaseItemQuantity(userID, itemId);
    return this.sendResponse(res, 200, 'item quantity increased', cart);
  }

  //decrease item quantity
  @httpPatch('/decrease/:itemId', TYPES.RequireSignIn)
  public async decreaseItemQuantity(@response() res: Response, @requestParam('itemId') itemId: string) {
    const userID = res.locals.user;

    const cart = await this.cartService.decreaseItemQuantity(userID, itemId);
    return this.sendResponse(res, 200, 'item quantity decreased', cart);
  }

  //update cart item (quantity, size, color)
  @httpPut('/:itemId', TYPES.RequireSignIn)
  public async updateCartItem(@response() res: Response, @requestParam('itemId') itemId: string, @requestBody() payload: UpdateCartItemDTO) {
    const userID = res.locals.user;

    const cart = await this.cartService.updateCartItem(userID, itemId, payload);
    return this.sendResponse(res, 200, 'Cart item updated successfully', cart);
  }

  //remove item from cart
  @httpDelete('/:itemId', TYPES.RequireSignIn)
  public async removeCartItem(@response() res: Response, @requestParam('itemId') itemId: string) {
    const userID = res.locals.user;

    const cart = await this.cartService.removeCartItem(userID, itemId);
    return this.sendResponse(res, 200, 'Item removed from cart successfully', cart);
  }

  //clear entire cart
  @httpDelete('/', TYPES.RequireSignIn)
  public async clearCart(@response() res: Response) {
    const userID = res.locals.user;

    await this.cartService.clearCart(userID);
    return this.sendResponse(res, 200, 'Cart cleared successfully');
  }
}
