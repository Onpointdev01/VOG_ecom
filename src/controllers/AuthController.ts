import { inject } from 'inversify';
import { controller, httpPost, requestBody, response } from 'inversify-express-utils';
import { Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IAuthService } from '../services';
import { LoginDTO, ResetPasswordDTO, SignUpUserDTO, socialLoginDTO, VerifyEmailDTO } from '../utils/dtos';
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

  //login
  @httpPost('/login')
  async login(@response() res: Response, @requestBody() payload: LoginDTO) {
    const { email, password } = payload;
    logger.info(`Login attempt for email: ${email}`);
    const result = await this.authService.login(email, password);
    return this.sendResponse(res, 200, 'Successfully logged in', result);
  }

  @httpPost('/social-login')
  async socialLogin(@response() res: Response, @requestBody() payload: socialLoginDTO) {
    const { idToken, provider } = payload;
    if (!idToken || !provider) throw new AppError('All fields are required', 400);

    logger.info(`Social login attempt for provider: ${provider}`);
    const result = await this.authService.socialLogin(idToken, provider);
    return this.sendResponse(res, 200, 'Successfully logged in', result);
  }

  //forgot password
  @httpPost('/forgot-password')
  async forgotPassword(@response() res: Response, @requestBody() payload: { email: string }) {
    const { email } = payload;
    if (!email) throw new AppError('Email is required', 400);
    await this.authService.forgotPassword(email);
    return this.sendResponse(res, 200, 'Password reset code sent');
  }

  //reset password
  @httpPost('/reset-password')
  async resetPassword(@response() res: Response, @requestBody() payload: ResetPasswordDTO) {
    const { email, code, password } = payload;
    if (!email || !code || !password) throw new AppError('All fields are required', 400);
    await this.authService.resetPassword(email, code, password);
    return this.sendResponse(res, 200, 'Password reset successful');
  }

  //verify email
  @httpPost('/verify-email')
  async verifyEmail(@response() res: Response, @requestBody() payload: VerifyEmailDTO) {
    const { email, code } = payload;
    if (!email || !code) throw new AppError('All fields are required', 400);
    const token = await this.authService.verifyEmail(code, email);
    return this.sendResponse(res, 200, 'Email verified', { token });
  }

  //resend verification code
  @httpPost('/resend-verification')
  async resendVerification(@response() res: Response, @requestBody() payload: { email: string }) {
    const { email } = payload;
    if (!email) throw new AppError('Email is required', 400);
    await this.authService.resendVerification(email);
    return this.sendResponse(res, 200, 'Verification code sent');
  }

  //check email
  @httpPost('/check-email')
  async checkEmail(@response() res: Response, @requestBody() payload: { email: string }) {
    const { email } = payload;
    if (!email) throw new AppError('Email is required', 400);
    const result = await this.authService.checkEmail(email);

    if (!result.isValid) {
      throw new AppError(result.message, 400);
    }

    if (!result.isAvailable) {
      throw new AppError(result.message, 409);
    }

    return this.sendResponse(res, 200, result.message, result);
  }
}
