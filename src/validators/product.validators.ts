import joi from 'joi';

export const getAllProductsSchema = joi.object({
  isFlash: joi.string().valid('0', '1'),
  category: joi.string(),
  search: joi.string(),
  seller: joi.string(),
});
