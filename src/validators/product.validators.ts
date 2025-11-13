import joi from 'joi';

export const getAllProductsSchema = joi.object({
  isFlash: joi.string().valid('0', '1'),
  isRecommended: joi.string().valid('0', '1'),
  category: joi.string(),
  search: joi.string(),
  seller: joi.string(),
  sortBy: joi.string().valid('name', 'price', 'createdAt', 'popularity', 'rating'),
  sortOrder: joi.string().valid('asc', 'desc'),
  minPrice: joi.string().pattern(/^\d+(\.\d+)?$/),
  maxPrice: joi.string().pattern(/^\d+(\.\d+)?$/),
  condition: joi.string().valid('Brand New', 'Like New', 'Good', 'Fair', 'Poor'),
  brand: joi.string(),
  page: joi.string().pattern(/^\d+$/),
  limit: joi.string().pattern(/^\d+$/),
});
