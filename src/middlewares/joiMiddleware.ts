import { NextFunction, Request, Response } from 'express';
import Joi from 'joi';
import AppError from '../utils/errors/AppError';

const joiMiddleware = (schema: Joi.Schema, property: 'body' | 'params' | 'query' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req[property || 'body'], { allowUnknown: true });

    //return error if the error object contains details
    if (error) {
      const { details }: Joi.ValidationError = error;
      const message = details.map((err: Joi.ValidationErrorItem) => err.message).join(',');

      throw new AppError(message, 422);
    }

    next();
  };
};

export default joiMiddleware;
