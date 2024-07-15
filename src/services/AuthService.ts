import { Model } from 'mongoose';
import { TYPES } from '../di';
import { IUser } from '../models';
import { inject, injectable } from 'inversify';
import logger from '../utils/logger';

export interface IAuthService {
  login(email: string, password: string): Promise<string>;
}

@injectable()
export class AuthService implements IAuthService {
  constructor(@inject(TYPES.User) private User: Model<IUser>) {}

  async login(email: string, password: string): Promise<string> {
    logger.info(`Implement Logging in user with email: ${email} and password: ${password}`);

    return '';
  }
}
