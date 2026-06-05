import Joi from 'joi';

export const createConversationSchema = Joi.object({
  text: Joi.string().trim().max(2000).optional().allow(''),
});

export const sendMessageSchema = Joi.object({
  text: Joi.string().trim().min(1).max(2000).required(),
  productId: Joi.string().hex().length(24).optional(),
});

export const conversationIdParamSchema = Joi.object({
  conversationId: Joi.string().hex().length(24).required(),
});

export const productIdParamSchema = Joi.object({
  productId: Joi.string().hex().length(24).required(),
});

export const sellerIdParamSchema = Joi.object({
  sellerId: Joi.string().hex().length(24).required(),
});

export const attachProductParamSchema = Joi.object({
  conversationId: Joi.string().hex().length(24).required(),
  productId: Joi.string().hex().length(24).required(),
});
