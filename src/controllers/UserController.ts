import { controller } from 'inversify-express-utils';
import { BaseController } from './BaseController';
import { inject } from 'inversify';
import { IAuthService } from '../services';
import TYPES from '../di';

@controller('/api/v1/user')
export class UserController extends BaseController {
  constructor(@inject(TYPES.AuthService) private authService: IAuthService) {
    super();
  }
}
