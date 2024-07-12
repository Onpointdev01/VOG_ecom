import { Request, Response } from 'express';
import { controller, httpGet, response } from 'inversify-express-utils';
import { successResponse } from '../utils/helpers/response';

@controller('/')
export class BaseController {
  sendResponse(@response() res: Response, status: number, mesage: string, data?: any) {
    return successResponse(res, status, mesage, data);
  }

  @httpGet('/')
  async index(req: Request, res: Response) {
    return this.sendResponse(res, 200, 'Welcome to the API');
  }
}
