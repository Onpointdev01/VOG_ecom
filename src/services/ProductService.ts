import { inject, injectable } from 'inversify';
import { FilterQuery, Model } from 'mongoose';
import TYPES from '../di';
import { IProduct } from '../models/Product';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import { createProductDTO, createReviewDTO, getAllProductsResponse } from '../utils/dtos';
import { IReview, IUser } from '../models';

export interface IProductService {
  createProduct(payload: createProductDTO): Promise<IProduct>;
  getProductById(id: string): Promise<IProduct>;
  getAllProducts(filter: FilterQuery<IProduct>, category?: string, search?: string): Promise<getAllProductsResponse[]>;
  updateProduct(id: string, payload: Partial<IProduct>): Promise<IProduct>;
  deleteProduct(id: string): Promise<void>;
  reviewProduct(review: createReviewDTO): Promise<IReview>;
}

@injectable()
export class ProductService extends BaseService implements IProductService {
  constructor(
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Review) private Review: Model<IReview>
  ) {
    super();
  }

  async createProduct(payload: createProductDTO): Promise<IProduct> {
    // Check if product exists by name or another unique identifier
    // const existingProduct = await this.Product.findOne({ name });
    // if (existingProduct) throw new AppError('Product already exists', 400);
    await this.verifyUser(payload.owner);
    const newProduct = await this.Product.create(payload);
    return newProduct;
  }

  async getProductById(id: string): Promise<IProduct> {
    const product = await this.Product.findById(id);
    if (!product) throw new AppError('Product not found', 404);
    return product;
  }

  // async getAllProducts(filter: FilterQuery<IProduct>): Promise<getAllProductsResponse[]> {
  //   return (
  //     this.Product.find(filter)
  //       .select('-createdAt -updatedAt -__v')
  //       .populate('owner', 'name rating logo official')
  //       // .populate({
  //       //   path: 'reviews',
  //       //   select: '-createdAt -updatedAt -__v',
  //       //   populate: {
  //       //     path: 'user',
  //       //     select: 'firstName profilePicture',
  //       //   },
  //       // })
  //       .lean()
  //   );
  // }
  async getAllProducts(
    filter: FilterQuery<IProduct>,
    category?: string,
    search?: string
  ): Promise<getAllProductsResponse[]> {
    let categoryMatch = {};
    if (category) {
      categoryMatch = { 'categoryData.name': category };
    }
    if (search) {
      const regexp = new RegExp(`.*${search}.*`, 'i');
      filter.$or = [{ name: { $regex: regexp } }, { description: { $regex: regexp } }];
      // { 'categoryData.name': { $regex: regexp } } to add category to the search
    }
    return this.Product.aggregate([
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryData',
        },
      },
      { $unwind: '$categoryData' },
      {
        $match: {
          $and: [filter, categoryMatch],
        },
      },
      {
        $lookup: {
          from: 'sellers',
          localField: 'owner',
          foreignField: '_id',
          as: 'ownerData',
        },
      },
      {
        $addFields: {
          owner: {
            $cond: {
              if: { $eq: [{ $size: '$ownerData' }, 0] },
              then: null,
              else: { $arrayElemAt: ['$ownerData', 0] },
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          price: 1,
          originalPrice: 1,
          rating: 1,
          noOfReviews: 1,
          images: 1,
          isActive: 1,
          isFlash: 1,
          category: {
            _id: '$categoryData._id',
            name: '$categoryData.name',
          },
          owner: {
            $cond: {
              if: { $ne: ['$owner', null] },
              then: {
                _id: '$owner._id',
                name: '$owner.name',
                rating: '$owner.rating',
                logo: '$owner.logo',
                official: '$owner.official',
              },
              else: null,
            },
          },
          itemDetails: {
            brand: '$brand',
            condition: '$condition',
            sizes: '$sizes',
            color: '$color',
            quantityAvailable: '$quantityAvailable',
          },
        },
      },
    ]).exec();
  }

  async updateProduct(id: string, payload: Partial<IProduct>): Promise<IProduct> {
    const updatedProduct = await this.Product.findByIdAndUpdate(id, payload, { new: true });
    if (!updatedProduct) throw new AppError('Product not found', 404);
    return updatedProduct;
  }

  async deleteProduct(id: string): Promise<void> {
    const result = await this.Product.findByIdAndDelete(id);
    if (!result) throw new AppError('Product not found', 404);
  }

  async reviewProduct(review: createReviewDTO): Promise<IReview> {
    const { product, user } = review;
    await this.verifyUser(user);
    await this.verifyProduct(product);
    const Creview = await this.Review.create(review);
    return Creview;
  }

  //private functions
  private async verifyUser(userId: string) {
    return await this.verifyDoc(userId, this.User);
  }

  private async verifyProduct(productId: string) {
    return await this.verifyDoc(productId, this.Product);
  }
}
