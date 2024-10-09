import { inject } from 'inversify';
import { controller, httpGet, httpPost, requestBody, response } from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import { ICartService } from '../services';
import { BaseController } from './BaseController';
import { AddToCartDTO } from '../utils/dtos';

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
}
