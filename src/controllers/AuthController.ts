import { inject } from 'inversify';
import { controller, httpPost, requestBody, response, request } from 'inversify-express-utils';
import { Response, Request } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IAuthService } from '../services';
import {
  LoginDTO,
  firebaseSocialLoginDTO,
  ResetPasswordDTO,
  SignUpSellerDTO,
  SignUpUserDTO,
  socialLoginDTO,
  VerifyEmailDTO,
} from '../utils/dtos';
import logger from '../utils/logger';
import AppError from '../utils/errors/AppError';
import { authRateLimiter, passwordResetRateLimiter } from '../middlewares/rateLimiter';

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */
@controller('/api/v1/auth')
export class AuthController extends BaseController {
  constructor(@inject(TYPES.AuthService) private authService: IAuthService) {
    super();
  }

  /**
   * @swagger
   * /api/v1/auth/signup:
   *   post:
   *     summary: Register a new user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *               - firstName
   *               - lastName
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *                 minLength: 6
   *               firstName:
   *                 type: string
   *               lastName:
   *                 type: string
   *               role:
   *                 type: string
   *                 enum: [user, seller]
   *                 default: user
   *     responses:
   *       201:
   *         description: User created successfully
   *       400:
   *         description: Validation error or email already exists
   *       403:
   *         description: Admin registration not allowed
   */
  //signup
  @httpPost('/signup')
  async signUpUser(@response() res: Response, @requestBody() payload: SignUpUserDTO) {
    const newUser = await this.authService.signupUser(payload);
    // If email wasn't sent, include warning in message
    const message = newUser.emailSent 
      ? 'created user successfully' 
      : 'Account created successfully, but we couldn\'t send the verification email. Please use the "Resend Verification" option.';
    return this.sendResponse(res, 201, message, newUser);
  }

  //signup seller
  @httpPost('/signup-seller')
  async signUpSeller(@response() res: Response, @requestBody() payload: SignUpSellerDTO) {
    const newSeller = await this.authService.signupSeller(payload);
    return this.sendResponse(res, 201, 'created seller successfully', newSeller);
  }

  /**
   * @swagger
   * /api/v1/auth/login:
   *   post:
   *     summary: Login user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *     responses:
   *       200:
   *         description: Login successful
   *         headers:
   *           Set-Cookie:
   *             description: Refresh token in httpOnly cookie
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: object
   *                   properties:
   *                     user:
   *                       $ref: '#/components/schemas/User'
   *                     token:
   *                       type: string
   *       400:
   *         description: Invalid credentials
   *       403:
   *         description: Email not verified
   */
  //login (with rate limiting)
  @httpPost('/login', authRateLimiter)
  async login(@response() res: Response, @requestBody() payload: LoginDTO) {
    const { email, password, type } = payload;
    logger.info(`Login attempt for email: ${email}, type: ${type || 'user'}`);
    const result = await this.authService.login(email, password, type);
    
    return this.sendResponse(res, 200, 'Successfully logged in', {
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
    });
  }

  @httpPost('/social-login')
  async socialLogin(@response() res: Response, @requestBody() payload: socialLoginDTO) {
    const { idToken, provider } = payload;
    if (!idToken || !provider) throw new AppError('All fields are required', 400);

    logger.info(`Social login attempt for provider: ${provider}`);
    const result = await this.authService.socialLogin(idToken, provider);
    
    return this.sendResponse(res, 200, 'Successfully logged in', {
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
    });
  }

  @httpPost('/firebase-social-login')
  async firebaseSocialLogin(@response() res: Response, @requestBody() payload: firebaseSocialLoginDTO) {
    const { firebaseIdToken, providerHint } = payload;
    if (!firebaseIdToken) throw new AppError('firebaseIdToken is required', 400);

    logger.info(`Firebase social login attempt for provider: ${providerHint || 'unknown'}`);
    const result = await this.authService.firebaseSocialLogin(firebaseIdToken, providerHint);

    return this.sendResponse(res, 200, 'Successfully logged in', {
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
    });
  }

  //forgot password (with rate limiting)
  @httpPost('/forgot-password', passwordResetRateLimiter)
  async forgotPassword(@response() res: Response, @requestBody() payload: { email: string }) {
    const { email } = payload;
    if (!email) throw new AppError('Email is required', 400);
    await this.authService.forgotPassword(email);
    return this.sendResponse(res, 200, 'Password reset code sent');
  }

  //reset password
  @httpPost('/reset-password')
  async resetPassword(@response() res: Response, @requestBody() payload: { token: string; password: string }) {
    const { token, password } = payload;
    if (!token || !password) throw new AppError('Token and password are required', 400);
    await this.authService.resetPassword(token, password);
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

  //refresh token
  @httpPost('/refresh-token')
  async refreshToken(@response() res: Response, @request() req: Request) {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token is required', 400);

    const result = await this.authService.refreshToken(refreshToken);
    
    return this.sendResponse(res, 200, 'Token refreshed successfully', {
      token: result.token,
      refreshToken: result.refreshToken,
    });
  }

  //logout
  @httpPost('/logout')
  async logout(@response() res: Response, @request() req: Request) {
    const userId = (req as any).user?.id || (req as any).user?._id;
    const { refreshToken } = req.body;
    
    if (userId && refreshToken) {
      await this.authService.logout(userId.toString(), refreshToken);
    }
    
    return this.sendResponse(res, 200, 'Logged out successfully');
  }
}
