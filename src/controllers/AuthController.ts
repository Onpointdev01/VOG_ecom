import { inject } from 'inversify';
import { controller, httpPost, requestBody, response } from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IAuthService } from '../services';
import { LoginDTO, ResetPasswordDTO, SignUpUserDTO, VerifyEmailDTO } from '../utils/dtos';
import logger from '../utils/logger';
import AppError from '../utils/errors/AppError';

@controller('/api/v1/auth')
export class AuthController extends BaseController {
  constructor(@inject(TYPES.AuthService) private authService: IAuthService) {
    super();
  }

  //signup
  @httpPost('/signup')
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

  @httpPost('/forgot-password')
  async forgotPassword(@response() res: Response, @requestBody() payload: { email: string }) {
    const { email } = payload;
    if (!email) throw new AppError('Email is required', 400);
    await this.authService.forgotPassword(email);
    return this.sendResponse(res, 200, 'Password reset code sent');
  }

  @httpPost('/reset-password')
  async resetPassword(@response() res: Response, @requestBody() payload: ResetPasswordDTO) {
    const { email, code, password } = payload;
    if (!email || !code || !password) throw new AppError('All fields are required', 400);
    await this.authService.resetPassword(email, code, password);
    return this.sendResponse(res, 200, 'Password reset successful');
  }

  @httpPost('/verify-email')
  async verifyEmail(@response() res: Response, @requestBody() payload: VerifyEmailDTO) {
    const { email, code } = payload;
    if (!email || !code) throw new AppError('All fields are required', 400);
    const token = await this.authService.verifyEmail(code, email);
    return this.sendResponse(res, 200, 'Email verified', { token });
  }

  @httpPost('/resend-verification')
  async resendVerification(@response() res: Response, @requestBody() payload: { email: string }) {
    const { email } = payload;
    if (!email) throw new AppError('Email is required', 400);
    await this.authService.resendVerification(email);
    return this.sendResponse(res, 200, 'Verification code sent');
  }
}
