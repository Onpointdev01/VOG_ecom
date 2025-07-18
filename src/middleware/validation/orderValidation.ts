import Joi from 'joi';
import joiMiddleware from '../../middlewares/joiMiddleware';

const createOrderSchema = Joi.object({
  paymentMethod: Joi.string()
    .valid('MPESA', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'CASH_ON_DELIVERY')
    .required()
    .messages({
      'any.only': 'Payment method must be one of: MPESA, ORANGE_MONEY, AIRTEL_MONEY, CASH_ON_DELIVERY',
      'any.required': 'Payment method is required',
    }),
  
  shippingAddressId: Joi.string()
    .required()
    .messages({
      'any.required': 'Shipping address ID is required',
    }),
  
  notes: Joi.string()
    .max(500)
    .optional()
    .messages({
      'string.max': 'Notes cannot exceed 500 characters',
    }),
});

export const validateCreateOrder = joiMiddleware(createOrderSchema, 'body');