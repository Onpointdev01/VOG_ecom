import joi from 'joi';

export const pageLimitSchemaDesc = {
  page: joi.number().min(1).default(1),
  limit: joi.number().min(1).default(10),
};
