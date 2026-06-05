import Joi from 'joi';

export const adminSellerIdSchema = Joi.object({
  sellerId: Joi.string().hex().length(24).required(),
});

export const adminConversationIdSchema = Joi.object({
  conversationId: Joi.string().hex().length(24).required(),
});

export const adminOpenConversationSchema = Joi.object({
  text: Joi.string().trim().max(2000).optional().allow(''),
});

export const adminChatMessageSchema = Joi.object({
  text: Joi.string().trim().min(1).max(2000).required(),
});

export const adminEmailBroadcastIdSchema = Joi.object({
  broadcastId: Joi.string().hex().length(24).required(),
});

export const adminBroadcastEmailSchema = Joi.object({
  audience: Joi.string().valid('buyers', 'sellers', 'everyone').required(),
  subject: Joi.string().trim().min(1).max(200).required(),
  html: Joi.string().trim().max(50000).optional().allow(''),
  text: Joi.string().trim().max(50000).optional().allow(''),
}).or('html', 'text');
