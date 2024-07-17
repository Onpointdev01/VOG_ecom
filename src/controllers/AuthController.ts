import { inject } from 'inversify';
import { controller, httpPost, requestBody, response } from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IAuthService } from '../services';
import { LoginDTO, SignUpUserDTO } from '../utils/dtos';
import logger from '../utils/logger';

@controller('/api/v1/auth')
export class AuthController extends BaseController {
  constructor(@inject(TYPES.AuthService) private authService: IAuthService) {
    super();
  }

  //signup
  @httpPost('/signup/user')
  async signUpUser(@response() res: Response, @requestBody() payload: SignUpUserDTO) {
    const newUser = await this.authService.signupUser(payload);
    return this.sendResponse(res, 201, 'created user successfully', newUser);
  }

  @httpPost('/login')
  async login(@response() res: Response, @requestBody() payload: LoginDTO) {
    const { email, password } = payload;
    logger.info(`Login attempt for email: ${email}`);
    const result = await this.authService.login(email, password);
    return this.sendResponse(res, 200, 'Successfully logged in', result);
  }
}
