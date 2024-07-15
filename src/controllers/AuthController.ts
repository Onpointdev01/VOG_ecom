import { inject } from 'inversify';
import { controller, httpPost, requestBody, response } from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IAuthService } from '../services';
import { LoginDTO } from '../utils/dtos';

@controller('/api/v1/auth')
export class AuthController extends BaseController {
  constructor(@inject(TYPES.AuthService) private authService: IAuthService) {
    super();
  }

  @httpPost('/login')
  async login(@response() res: Response, @requestBody() payload: LoginDTO) {
    const { email, password } = payload;
    const result = await this.authService.login(email, password);
    return this.sendResponse(res, 200, 'Successfully logged in', result);
  }
}
