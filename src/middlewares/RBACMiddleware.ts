/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { inject, injectable } from 'inversify';
import { BaseMiddleware } from 'inversify-express-utils';
import { ParsedQs } from 'qs';
import AppError from '../utils/errors/AppError';
import TYPES from '../di';
import { IUser } from '../models';

export type UserRole = 'user' | 'seller' | 'admin';

/**
 * Centralized RBAC Middleware
 * Requires authentication and specific role(s)
 */
@injectable()
export class RequireRole extends BaseMiddleware {
  constructor(private allowedRoles: UserRole[]) {
    super();
  }

  handler(
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    res: Response<any, Record<string, any>>,
    next: NextFunction
  ): void {
    try {
      const user = req.user as IUser;

      if (!user) {
        return next(new AppError('Authentication required', 401));
      }

      if (!this.allowedRoles.includes(user.role as UserRole)) {
        return next(
          new AppError(
            `Access denied. Required role: ${this.allowedRoles.join(' or ')}`,
            403
          )
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  }
}

/**
 * Require Admin Role
 */
@injectable()
export class RequireAdminRole extends BaseMiddleware {
  handler(
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    res: Response<any, Record<string, any>>,
    next: NextFunction
  ): void {
    try {
      const user = req.user as IUser;

      if (!user) {
        return next(new AppError('Authentication required', 401));
      }

      if (user.role !== 'admin') {
        return next(new AppError('Admin access required', 403));
      }

      next();
    } catch (err) {
      next(err);
    }
  }
}

/**
 * Require Seller Role
 */
@injectable()
export class RequireSellerRole extends BaseMiddleware {
  handler(
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    res: Response<any, Record<string, any>>,
    next: NextFunction
  ): void {
    try {
      const user = req.user as IUser;

      if (!user) {
        return next(new AppError('Authentication required', 401));
      }

      if (user.role !== 'seller') {
        return next(new AppError('Seller access required', 403));
      }

      next();
    } catch (err) {
      next(err);
    }
  }
}

/**
 * Require User Role (client)
 */
@injectable()
export class RequireUserRole extends BaseMiddleware {
  handler(
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    res: Response<any, Record<string, any>>,
    next: NextFunction
  ): void {
    try {
      const user = req.user as IUser;

      if (!user) {
        return next(new AppError('Authentication required', 401));
      }

      if (user.role !== 'user') {
        return next(new AppError('User access required', 403));
      }

      next();
    } catch (err) {
      next(err);
    }
  }
}

