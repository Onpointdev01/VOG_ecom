import { inject, injectable } from 'inversify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { Model } from 'mongoose';
import { TYPES } from '../di';
import { IUser } from '../models';
import { SignUpUserDTO } from '../utils/dtos';
import AppError from '../utils/errors/AppError';
import { generateAccessToken, generateCode } from '../utils/helpers';

export interface IAuthService {
  signupUser(payload: SignUpUserDTO): Promise<Partial<IUser>>;
  login(email: string, password: string): Promise<{ user: Partial<IUser>; token: string }>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(email: string, code: string, password: string): Promise<void>;
  verifyEmail(code: string, email: string): Promise<string>;
  resendVerification(email: string): Promise<void>;
}

@injectable()
export class AuthService implements IAuthService {
  constructor(@inject(TYPES.User) private User: Model<IUser>) {}

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

    const token = await generateAccessToken(user._id as string);

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

  async forgotPassword(email: string): Promise<void> {
    const user = await this.User.findOne({ email });
    if (!user) throw new AppError('User not found', 404);

    const code = generateCode(6);
    const expiresIn = 10;
    user.passwordResetToken = code;
    user.passwordResetExpires = new Date(Date.now() + expiresIn * 60 * 1000);

    await user.save();
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
}
