import { inject, injectable } from 'inversify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { Model } from 'mongoose';
import { TYPES } from '../di';
import { IUser } from '../models';
import { EmailCheckResult, SignUpSellerDTO, SignUpUserDTO } from '../utils/dtos';
import AppError from '../utils/errors/AppError';
import { generateAccessToken, generateCode, generateRefreshToken, decodeToken } from '../utils/helpers';
import { sendEmail, renderTemplate } from '../utils/helpers/sendMail';
import validator from 'validator';
import { OAuth2Client } from 'google-auth-library';
import { BaseService } from './BaseService';
import { ISeller } from '../models/Seller';

export interface IAuthService {
  signupUser(payload: SignUpUserDTO): Promise<Partial<IUser>>;
  signupSeller(payload: SignUpSellerDTO): Promise<Partial<ISeller>>;
  login(email: string, password: string): Promise<{ user: Partial<IUser>; token: string; refreshToken: string }>;
  socialLogin(
    idToken: string,
    provider: string
  ): Promise<{ user: Partial<IUser>; token: string; refreshToken: string }>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(email: string, code: string, password: string): Promise<void>;
  verifyEmail(code: string, email: string): Promise<string>;
  resendVerification(email: string): Promise<void>;
  checkEmail(email: string): Promise<EmailCheckResult>;
  checkBannedOrDeleted(userId: string): Promise<Partial<IUser>>;
  refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }>;
}

@injectable()
export class AuthService extends BaseService implements IAuthService {
  private oAuth2Client: OAuth2Client;
  constructor(@inject(TYPES.User) private User: Model<IUser>, @inject(TYPES.Seller) private Seller: Model<ISeller>) {
    super();
    this.oAuth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  }
  async checkBannedOrDeleted(userId: string): Promise<IUser> {
    const user = await this.User.findById(userId);

    if (!user) {
      throw new AppError('user not found', 404);
    }

    if (user?.banned) {
      throw new AppError('You cannot log in', 403);
    }

    return user;
  }

  async signupUser(payload: SignUpUserDTO): Promise<Partial<IUser>> {
    const { email, firstName, lastName, nationality, phoneNumber, currentLocation } = payload;
    let { password } = payload;
    //check if user exists
    const prevUser = await this.User.findOne({ email });
    if (prevUser) throw new AppError(`Email ${email} already registered`, 400);

    //hash password
    password = await bcrypt.hash(password, 10);
    const newUser = await this.User.create({
      email,
      password,
      firstName,
      lastName,
      nationality,
      phoneNumber,
      currentLocation,
    });

    //TODO: generate and send verification email

    return { id: newUser._id, email, firstName, lastName };
  }

  //signup as seller add more validation and the likes
  async signupSeller(payload: SignUpSellerDTO): Promise<Partial<ISeller>> {
    const { name, type, logo, official, user } = payload;

    console.log('name: ', name, 'user: ', user);

    const prevUser = await this.User.findById(user);
    if (!prevUser) throw new AppError(`User not found`, 404);

    //check if user is already a seller
    const prevSeller = await this.Seller.findOne({ user });
    if (prevSeller) throw new AppError(`User is already a seller`, 400);

    const newSeller = await this.Seller.create({
      user,
      name,
      type,
      logo,
      official,
    });

    // Update the user's seller field
    await this.User.findByIdAndUpdate(user, { seller: newSeller._id });

    return { id: newSeller._id, name, type, logo, official };
  }

  login = async (
    email: string,
    password: string
  ): Promise<{ user: Partial<IUser>; token: string; refreshToken: string }> => {
    const user: IUser | null = await this.User.findOne({ email }, '+password');
    if (!user) {
      throw new AppError('Invalid email or password', 400);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 400);
    }

    const token = generateAccessToken(user._id as string);
    const refreshToken = generateRefreshToken(user._id as string);

    await this.User.findByIdAndUpdate(user._id, { refreshToken: refreshToken });

    const trimedUser: Partial<IUser> = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      nationality: user.nationality,
      currentLocation: user.currentLocation,
      banned: user.banned,
      verified: user.verified,
    };
    return { user: trimedUser, token: token, refreshToken: refreshToken };
  };

  async socialLogin(
    idToken: string,
    provider: string
  ): Promise<{ user: Partial<IUser>; token: string; refreshToken: string }> {
    let payload: any;

    if (provider === 'google') {
      try {
        const ticket = await this.oAuth2Client.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
        // console.log(payload);
      } catch (error) {
        // Handle specific Google token verification errors, look for better way to handle it
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();

          if (/invalid token signature/i.test(errorMessage)) {
            throw new AppError('Invalid Google token', 401);
          } else if (/token used too late/i.test(errorMessage)) {
            throw new AppError('Google token has expired', 401);
          } else if (
            /wrong number of segments/i.test(errorMessage) ||
            /not enough or too many segments/i.test(errorMessage)
          ) {
            throw new AppError('Malformed Google token', 400);
          } else if (/no pem found for envelope/i.test(errorMessage)) {
            throw new AppError('Invalid Google token format', 400);
          } else if (/invalid audience/i.test(errorMessage)) {
            throw new AppError('Invalid audience in Google token', 401);
          } else if (/invalid issuer/i.test(errorMessage)) {
            throw new AppError('Invalid issuer in Google token', 401);
          } else {
            console.error('Google token verification error:', error);
            throw new AppError('Failed to verify Google token', 500);
          }
        } else {
          console.error('Unknown error during Google token verification:', error);
          throw new AppError('An unexpected error occurred', 500);
        }
      }
    } else {
      throw new AppError('Unsupported provider', 400);
    }

    const socialId = payload?.sub;
    if (!socialId) {
      throw new AppError('No user ID found in token payload', 400);
    }

    // Rest of your function remains the same
    let user = await this.User.findOne({
      'socialLogin.providerId': socialId,
      'socialLogin.provider': provider,
    });

    if (!user) {
      const userWithEmail = await this.User.findOne({ email: payload?.email });
      if (userWithEmail) {
        userWithEmail.socialLogin.push({ provider: provider, providerId: socialId });
        await userWithEmail.save();

        const trimedUser: Partial<IUser> = {
          _id: userWithEmail._id,
          email: userWithEmail.email,
          firstName: userWithEmail.firstName,
          lastName: userWithEmail.lastName,
          profileImageUrl: userWithEmail.profileImageUrl,
          nationality: userWithEmail.nationality,
          currentLocation: userWithEmail.currentLocation,
          banned: userWithEmail.banned,
          verified: userWithEmail.verified,
        };
        return {
          user: trimedUser,
          token: generateAccessToken(userWithEmail._id as string),
          refreshToken: generateRefreshToken(userWithEmail._id as string),
        };
      } else {
        // Register new user if not found
        user = new this.User({
          email: payload?.email,
          firstName: payload?.given_name,
          lastName: payload?.family_name,
          profileImageUrl: payload?.picture,
          socialLogins: [{ provider: provider, providerId: socialId }],
        });
        await user.save();
      }
    }

    const token = await generateAccessToken(user._id as string);
    const refreshToken = await generateRefreshToken(user._id as string);
    const trimedUser: Partial<IUser> = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      nationality: user.nationality,
      currentLocation: user.currentLocation,
      banned: user.banned,
      verified: user.verified,
    };
    return { user: trimedUser, token: token, refreshToken: refreshToken };
  }
  async forgotPassword(email: string): Promise<void> {
    const user = await this.User.findOne({ email });
    if (!user) throw new AppError('User not found', 404);

    const code = generateCode(6);
    const expiresIn = 10;
    user.passwordResetToken = code;
    user.passwordResetExpires = new Date(Date.now() + expiresIn * 60 * 1000);

    await user.save();
    await this.sendVerificationCode();
    //TODO: send email with code
  }

  async resetPassword(email: string, code: string, password: string): Promise<void> {
    const user = await this.User.findOne({ email });
    if (!user) throw new AppError('User not found', 404);

    if (user.passwordResetExpires!.getTime() < Date.now()) throw new AppError('provided code is expired', 400);

    const hashedCode = crypto.createHash('md5').update(code).digest('hex');
    if (user.passwordResetToken !== hashedCode) throw new AppError('code does not match code sent', 400);

    password = await bcrypt.hash(password, 10);
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();
  }

  async checkEmail(email: string): Promise<EmailCheckResult> {
    const isValid = validator.isEmail(email);

    if (!isValid) {
      return { isValid: false, isAvailable: false, message: 'Email is invalid' };
    }

    const existingUser = await this.User.findOne({ email });
    if (existingUser) {
      return { isValid: true, isAvailable: false, message: 'Email linked to another account' };
    }

    return { isValid: true, isAvailable: true, message: 'Email is available' };
  }

  async verifyEmail(code: string, email: string): Promise<string> {
    const user = await this.User.findOne({ email });

    if (!user) throw new AppError('User not found', 404);

    if (user.verified) throw new AppError('Email already verified', 400);

    if (user.verifyCodeExpires!.getTime() < Date.now()) throw new AppError('provided code is expired', 400);

    const hashedCode = crypto.createHash('md5').update(code).digest('hex');
    if (user.verifyCode !== hashedCode) throw new AppError('code does not match code sent', 400);

    user.verified = true;
    user.verifyCodeExpires = undefined;
    user.verifyCode = undefined;

    await user.save();
    return generateAccessToken(user._id as string);
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.User.findOne({ email });
    if (!user) throw new AppError('User not found', 404);

    if (user.verified) throw new AppError('Email already verified', 403);
    //TODO: send email with code
  }

  private async sendVerificationCode() {
    const code = generateCode(6);
    // const minutesToExpire = 10;
    // user.verifyCode = crypto.createHash('md5').update(code).digest('hex');
    // user.verifyCodeExpires = new Date(Date.now() + minutesToExpire * 60 * 1000); //should expire in 10 minutes

    // await user.save();
    const usersName = 'benjys' as string;
    await sendEmail({
      to: ['smtpbenjo@gmail.com'],
      subject: 'Email Verification',
      html: renderTemplate('src/utils/templates/password-reset.html', { usersName, code }),
    });
  }

  async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    try {
      const decoded = await decodeToken(refreshToken, true);
      const userId = decoded.id;

      const user = await this.User.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      if (user.refreshToken !== refreshToken) {
        throw new AppError('Invalid refresh token', 401);
      }

      const newAccessToken = generateAccessToken(user._id as string);
      const newRefreshToken = generateRefreshToken(user._id as string);

      await this.User.findByIdAndUpdate(userId, { refreshToken: newRefreshToken });

      return { token: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
      throw new AppError('Invalid refresh token', 401);
    }
  }
}
