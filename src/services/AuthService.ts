import { inject, injectable } from 'inversify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { Model } from 'mongoose';
import { TYPES } from '../di';
import { IUser } from '../models';
import { EmailCheckResult, SignUpUserDTO } from '../utils/dtos';
import AppError from '../utils/errors/AppError';
import { generateAccessToken, generateCode } from '../utils/helpers';
import { sendEmail, renderTemplate } from '../utils/helpers/sendMail';
import validator from 'validator';
import { OAuth2Client } from 'google-auth-library';
import { BaseService } from './BaseService';

export interface IAuthService {
  signupUser(payload: SignUpUserDTO): Promise<Partial<IUser>>;
  login(email: string, password: string): Promise<{ user: Partial<IUser>; token: string }>;
  socialLogin(idToken: string, provider: string): Promise<{ user: Partial<IUser>; token: string }>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(email: string, code: string, password: string): Promise<void>;
  verifyEmail(code: string, email: string): Promise<string>;
  resendVerification(email: string): Promise<void>;
  checkEmail(email: string): Promise<EmailCheckResult>;
}

@injectable()
export class AuthService extends BaseService implements IAuthService {
  private oAuth2Client: OAuth2Client;
  constructor(@inject(TYPES.User) private User: Model<IUser>) {
    super();
    this.oAuth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
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

    return { _id: newUser._id, email, firstName, lastName };
  }

  login = async (email: string, password: string): Promise<{ user: Partial<IUser>; token: string }> => {
    const user: IUser | null = await this.User.findOne({ email }, '+password');
    if (!user) {
      throw new AppError('Invalid email or password', 400);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 400);
    }

    const token = generateAccessToken(user._id as string);

    const trimedUser: Partial<IUser> = {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      nationality: user.nationality,
      currentLocation: user.currentLocation,
      banned: user.banned,
      verified: user.verified,
    };
    return { user: trimedUser, token: token };
  };

  async socialLogin(idToken: string, provider: string): Promise<{ user: Partial<IUser>; token: string }> {
    let payload: any;

    if (provider === 'google') {
      const ticket = await this.oAuth2Client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    }
    // Add more providers (e.g., Facebook) as needed
    else {
      throw new AppError('Unsupported provider', 400);
    }
    const socialId = payload?.sub;
    if (!socialId) {
      throw new AppError('No user ID found in token payload', 400);
    }

    let user = await this.User.findOne({
      'socialLogins.providerId': socialId,
      'socialLogins.provider': provider,
    });
    if (!user) {
      // Register new user if not found
      user = new this.User({
        email: payload?.email,
        name: payload?.name,
        socialLogins: [{ provider: provider, providerId: socialId }],
      });
      await user.save();
    }

    const token = await generateAccessToken(user._id as string);
    return { user: user, token: token };
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
}
