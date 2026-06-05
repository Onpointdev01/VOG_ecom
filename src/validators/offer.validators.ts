import Joi from 'joi';

export const createOfferSchema = Joi.object({
  amount: Joi.number().positive().required(),
  message: Joi.string().trim().max(2000).optional().allow(''),
  quantity: Joi.number().integer().min(1).optional(),
  currency: Joi.string().trim().max(8).optional(),
});

export const counterOfferSchema = Joi.object({
  amount: Joi.number().positive().required(),
  message: Joi.string().trim().max(2000).optional().allow(''),
  quantity: Joi.number().integer().min(1).optional(),
  currency: Joi.string().trim().max(8).optional(),
});

export const offerIdParamSchema = Joi.object({
  offerId: Joi.string().hex().length(24).required(),
});

export const addOfferToCartSchema = Joi.object({
  size: Joi.string().trim().allow('').optional(),
  color: Joi.string().trim().allow('').optional(),
});

export const rejectOfferSchema = Joi.object({
  reason: Joi.string().trim().max(500).optional().allow(''),
});

export const acceptOfferSchema = Joi.object({
  message: Joi.string().trim().max(500).optional().allow(''),
});
