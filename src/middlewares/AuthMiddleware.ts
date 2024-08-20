// import { NextFunction, Request, Response } from 'express';
// import { ParamsDictionary } from 'express-serve-static-core';
// import { inject, injectable } from 'inversify';
// import { BaseMiddleware } from 'inversify-express-utils';
// import { ParsedQs } from 'qs';
// import jwt from 'jsonwebtoken';
// import AppError from '../utils/errors/AppError';
// import TYPES from '../di';
// import { IAuthService } from '../services';
// import { IUser } from '../models';

// @injectable()
// export class RequireSignIn extends BaseMiddleware {
//   constructor(@inject(TYPES.AuthService) private authService: IAuthService) {
//     super();
//   }
//   handler(
//     req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
//     res: Response<any, Record<string, any>>,
//     next: NextFunction
//   ): void {
//     try {
//       const authHeader: string = req.headers['authorization'] || '';
//       if (!authHeader) {
//         return next(new AppError('No token provided', 401));
//       }

//       const token: string = authHeader.replace('Bearer ', '');

//       //verify JWT
//       jwt.verify(token, process.env.JWT_SECRET, async (err: any, decoded: any) => {
//         if (err) {
//           return next(new AppError('Invalid token provided', 403));
//         }
//         // console.log(decoded);
//         const userId = decoded.id.toString();

//         if (!userId) return next(new AppError('Invalid token provided', 403));

//         //save user object in body if user isn't banned/deleted
//         // const user = await this.authService.checkBannedOrDeleted(userId);

//         req.user = user as IUser;
//         res.locals.user = user;

//         next();
//       });
//     } catch (err) {
//       next(err);
//     }
//   }
// }
