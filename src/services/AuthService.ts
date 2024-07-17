import { inject, injectable } from 'inversify';
import bcrypt from 'bcryptjs';

import { Model } from 'mongoose';
import { TYPES } from '../di';
import { IUser } from '../models';
import { SignUpUserDTO } from '../utils/dtos';
import AppError from '../utils/errors/AppError';
import { generateAccessToken } from '../utils/helpers';

export interface IAuthService {
  signupUser(payload: SignUpUserDTO): Promise<Partial<IUser>>;
  login(email: string, password: string): Promise<{ user: Partial<IUser>; token: string }>;
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
    return { user: user, token: token };
  };
}
