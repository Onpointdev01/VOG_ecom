/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { inject, injectable } from 'inversify';
import { BaseMiddleware } from 'inversify-express-utils';
import { ParsedQs } from 'qs';
import jwt, { TokenExpiredError } from 'jsonwebtoken';
import AppError from '../utils/errors/AppError';
import TYPES from '../di';
import { IAuthService, IAdminService } from '../services';
import { IUser, IAdmin } from '../models';
import { env } from '../config';

@injectable()
export class RequireSignIn extends BaseMiddleware {
  constructor(@inject(TYPES.AuthService) private authService: IAuthService) {
    super();
  }
  handler(
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    res: Response<any, Record<string, any>>,
    next: NextFunction
  ): void {
    try {
      const authHeader: string = req.headers['authorization'] || '';
      if (!authHeader) {
        return next(new AppError('No token provided', 401));
      }

      const token: string = authHeader.replace('Bearer ', '');
      // console.log('token', token);
      //verify JWT
      jwt.verify(token, env.JWT_SECRET, async (err: any, decoded: any) => {
        if (err) {
          if (err instanceof TokenExpiredError) {
            return next(new AppError('Token has expired. Please log in again.', 401));
          }
          return next(new AppError('Invalid token provided', 403));
        }
        // console.log(decoded);
        const userId = decoded.id.toString();

        if (!userId) return next(new AppError('Invalid token provided', 403));

        try {
          //save user object in body if user isn't banned/deleted
          const user = await this.authService.checkBannedOrDeleted(userId);
          req.user = user as IUser;
          res.locals.user = userId;
          next();
        } catch (e) {
          next(e);
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

@injectable()
export class RequireSeller extends BaseMiddleware {
  handler(
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    res: Response<any, Record<string, any>>,
    next: NextFunction
  ): void {
    try {
      const user = req.user as IUser;

      if (!user) {
        return next(new AppError('User not authenticated', 401));
      }

      if (!user.seller) {
        return next(new AppError('Operation not allowed', 403));
      }

      next();
    } catch (err) {
      next(err);
    }
  }
}

@injectable()
export class RequireAdmin extends BaseMiddleware {
  constructor(@inject(TYPES.AdminService) private adminService: IAdminService) {
    super();
  }

  handler(
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    res: Response<any, Record<string, any>>,
    next: NextFunction
  ): void {
    try {
      const authHeader: string = req.headers['authorization'] || '';
      if (!authHeader) {
        return next(new AppError('No token provided', 401));
      }

      const token: string = authHeader.replace('Bearer ', '');
      
      // Verify JWT for admin
      jwt.verify(token, env.JWT_SECRET, async (err: any, decoded: any) => {
        if (err) {
          if (err instanceof TokenExpiredError) {
            return next(new AppError('Token has expired. Please log in again.', 401));
          }
          return next(new AppError('Invalid token provided', 403));
        }

        const adminId = decoded.id.toString();
        const userType = decoded.userType; // Should be 'admin'

        if (!adminId || userType !== 'admin') {
          return next(new AppError('Admin access required', 403));
        }

        // Check if admin exists and is active
        const admin = await this.adminService.checkAdminStatus(adminId);
        if (!admin) {
          return next(new AppError('Admin not found or inactive', 403));
        }

        req.admin = admin as IAdmin;
        res.locals.admin = adminId;

        next();
      });
    } catch (err) {
      next(err);
    }
  }
}

@injectable()
export class OptionalAuth extends BaseMiddleware {
  constructor(@inject(TYPES.AuthService) private authService: IAuthService) {
    super();
  }

  async handler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader: string = req.headers['authorization'] || '';

      // If the authorization header is present, decode the token
      if (authHeader) {
        const token: string = authHeader.replace('Bearer ', '');

        // Verify JWT token
        jwt.verify(token, env.JWT_SECRET, async (err: any, decoded: any) => {
          if (err) {
            if (err instanceof TokenExpiredError) {
              return next(new AppError('Token has expired. Please log in again.', 401));
            }
            return next(new AppError('Invalid token provided', 403));
          }

          const userId = decoded.id.toString();

          if (!userId) return next(new AppError('Invalid token provided', 403));

          try {
            const user = await this.authService.checkBannedOrDeleted(userId);
            req.user = user as IUser;
            res.locals.user = user as IUser;
            return next();
          } catch (e) {
            // OptionalAuth: user not found or banned – continue without attaching user
            return next();
          }
        });

        // If token is verified correctly, return and do not continue further
        return;
      }

      // If no token provided, simply move to the next middleware
      return next();
    } catch (err) {
      return next(err);
    }
  }
}
