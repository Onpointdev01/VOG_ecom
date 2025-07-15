/* eslint-disable @typescript-eslint/no-explicit-any */
import { inject, injectable } from 'inversify';
import { FilterQuery, Model } from 'mongoose';
import TYPES from '../di';
import { IProduct } from '../models/Product';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import { createProductDTO, createReviewDTO, getAllProductsResponse } from '../utils/dtos';
import { IReview, IUser, IProductVariant, ProductVariant, ISeller } from '../models';

export interface IProductService {
  createProduct(payload: createProductDTO): Promise<IProduct>;
  createSimpleProduct(payload: createProductDTO): Promise<IProduct>;
  createVariableProduct(payload: any): Promise<IProduct>;
  bulkCreateSimpleProducts(payload: any): Promise<IProduct[]>;
  duplicateProduct(productId: string, modifications: any): Promise<IProduct>;
  getProductById(id: string): Promise<IProduct>;
  getAllProducts(
    filter: FilterQuery<IProduct>,
    category?: string,
    search?: string,
    user?: IUser
  ): Promise<any[]>;
  updateProduct(id: string, payload: Partial<IProduct>): Promise<IProduct>;
  deleteProduct(id: string): Promise<void>;
  reviewProduct(review: createReviewDTO): Promise<IReview>;
}

@injectable()
export class ProductService extends BaseService implements IProductService {
  constructor(
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.ProductVariant) private ProductVariant: Model<IProductVariant>,
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Review) private Review: Model<IReview>,
    @inject(TYPES.Seller) private Seller: Model<ISeller>
  ) {
    super();
  }

  async createProduct(payload: createProductDTO): Promise<IProduct> {
    // Check if product exists by name or another unique identifier
    // const existingProduct = await this.Product.findOne({ name });
    // if (existingProduct) throw new AppError('Product already exists', 400);
    await this.verifySeller(payload.owner.toString());
    const newProduct = await this.Product.create(payload);
    return newProduct;
  }

  async getProductById(id: string): Promise<any> {
    const product = await this.Product.findById(id).lean();
    if (!product) throw new AppError('Product not found', 404);

    // If it's a variable product, populate variants
    if (product.productType === 'variable') {
      const variants = await this.ProductVariant.find({ 
        product: id, 
        isActive: true 
      }).select('sku size color price originalPrice quantityAvailable images');

      return {
        ...product,
        id: product._id.toString(),
        _id: undefined,
        variants: variants.map(v => ({
          ...v.toObject(),
          id: (v._id as any).toString(),
          _id: undefined
        })),
        // Computed fields for variable products
        priceRange: variants.length > 0 ? {
          min: Math.min(...variants.map(v => v.price)),
          max: Math.max(...variants.map(v => v.price))
        } : null,
        totalStock: variants.reduce((sum, v) => sum + v.quantityAvailable, 0),
        availableColors: Array.from(new Set(variants.map(v => v.color))),
        availableSizes: Array.from(new Set(variants.map(v => v.size)))
      };
    }

    // For simple products, add computed fields
    return {
      ...product,
      id: (product._id as any).toString(),
      _id: undefined,
      variants: [],
      priceRange: null, // Simple products have fixed price
      totalStock: product.quantityAvailable || 0,
      availableColors: product.color ? [product.color] : [],
      availableSizes: [] // Simple products don't have size variations
    };
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
    search?: string,
    user?: IUser
  ): Promise<any[]> {
    let categoryMatch = {};
    if (category) {
      categoryMatch = { 'categoryData.name': category };
    }
    if (search) {
      const regexp = new RegExp(`.*${search}.*`, 'i');
      filter.$or = [{ name: { $regex: regexp } }, { description: { $regex: regexp } }];
      // { 'categoryData.name': { $regex: regexp } } to add category to the search
    }
    const aggregationPipeline: any[] = [
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
            color: '$color',
            quantityAvailable: '$quantityAvailable',
          },
        },
      },
    ];
    // If the user is authenticated, check their wishlist
    if (user) {
      aggregationPipeline.push({
        $addFields: {
          isWishlist: {
            $cond: {
              if: {
                $in: [
                  '$_id', // The product's _id
                  user.wishlist, // The user's wishlist array
                ],
              },
              then: true,
              else: false,
            },
          },
        },
      });
    }

    // Add lookup for variants (for variable products)
    aggregationPipeline.push({
      $lookup: {
        from: 'productvariants',
        localField: '_id',
        foreignField: 'product',
        as: 'variants',
        pipeline: [
          { $match: { isActive: true } },
          { $project: { sku: 1, size: 1, color: 1, price: 1, quantityAvailable: 1, images: 1 } }
        ]
      }
    });

    // Add computed fields based on product type
    aggregationPipeline.push({
      $addFields: {
        // For variable products, compute from variants
        computedPrice: {
          $cond: {
            if: { $eq: ['$productType', 'variable'] },
            then: {
              $cond: {
                if: { $gt: [{ $size: '$variants' }, 0] },
                then: { $min: '$variants.price' }, // Show minimum price for variable
                else: '$price'
              }
            },
            else: '$price' // Use direct price for simple products
          }
        },
        priceRange: {
          $cond: {
            if: { $and: [{ $eq: ['$productType', 'variable'] }, { $gt: [{ $size: '$variants' }, 0] }] },
            then: {
              min: { $min: '$variants.price' },
              max: { $max: '$variants.price' }
            },
            else: null
          }
        },
        totalStock: {
          $cond: {
            if: { $eq: ['$productType', 'variable'] },
            then: { $sum: '$variants.quantityAvailable' },
            else: '$quantityAvailable'
          }
        },
        availableColors: {
          $cond: {
            if: { $eq: ['$productType', 'variable'] },
            then: { $setUnion: ['$variants.color', []] }, // Unique colors from variants
            else: { $cond: { if: '$color', then: ['$color'], else: [] } } // Single color as array for simple products
          }
        },
        availableSizes: {
          $cond: {
            if: { $eq: ['$productType', 'variable'] },
            then: { $setUnion: ['$variants.size', []] }, // Unique sizes from variants
            else: [] // Simple products don't have sizes field anymore
          }
        }
      }
    });

    const products = await this.Product.aggregate(aggregationPipeline).exec();
    
    // Transform _id to id using schema transforms where possible
    return products.map(product => {
      const result: any = {
        id: product._id.toString(),
        name: product.name,
        description: product.description,
        productType: product.productType,
        price: product.price,
        originalPrice: product.originalPrice,
        rating: product.rating,
        noOfReviews: product.noOfReviews,
        images: product.images,
        isActive: product.isActive,
        isFlash: product.isFlash,
        brand: product.brand,
        condition: product.condition,
        color: product.color,
        quantityAvailable: product.quantityAvailable,
        computedPrice: product.computedPrice,
        priceRange: product.priceRange,
        totalStock: product.totalStock,
        availableColors: product.availableColors,
        availableSizes: product.availableSizes,
        isWishlist: product.isWishlist,
        category: product.category ? {
          id: product.category._id?.toString(),
          name: product.category.name
        } : null,
        owner: product.owner ? {
          id: product.owner._id?.toString(),
          name: product.owner.name,
          rating: product.owner.rating,
          logo: product.owner.logo,
          official: product.owner.official
        } : null,
        variants: product.variants?.map((variant: any) => ({
          id: variant._id?.toString(),
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          price: variant.price,
          quantityAvailable: variant.quantityAvailable,
          images: variant.images
        })) || []
      };
      
      return result;
    });
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

  async createSimpleProduct(payload: createProductDTO): Promise<IProduct> {
    await this.verifySeller(payload.owner.toString());
    const productData = {
      ...payload,
      productType: 'simple' as const
    };
    const newProduct = await this.Product.create(productData);
    return newProduct;
  }

  async createVariableProduct(payload: any): Promise<IProduct> {
    try {
      const { product, variants } = payload;
      
      
      await this.verifySeller(product.owner.toString());

      // Validate required data
      if (!variants || variants.length === 0) {
        throw new AppError('Variable products must have at least one variant', 400);
      }

      // Create the variable product
      const { price, originalPrice, color, quantityAvailable, condition, ...productData } = product;
      
      const variableProduct = await this.Product.create({
        ...productData,
        productType: 'variable',
        images: product.images || [],
        // Explicitly exclude fields that should not be at product level for variable products
      });

      // Create all variants one by one to trigger validation/save hooks for SKU generation
      const createdVariants = [];
      for (const variantInfo of variants) {
        
        const variant = new this.ProductVariant({
          ...variantInfo,
          product: variableProduct._id,
        });
        const savedVariant = await variant.save();
        createdVariants.push(savedVariant);
      }

      // Return the product with variants populated
      return {
        ...variableProduct.toObject(),
        variants: createdVariants
      } as any;
    } catch (error: any) {
      // Convert MongoDB errors to structured AppError
      throw AppError.fromMongoError(error);
    }
  }

  async bulkCreateSimpleProducts(payload: any): Promise<IProduct[]> {
    const { baseProduct, variations } = payload;
    await this.verifySeller(baseProduct.owner.toString());

    const products = variations.map((variation: any) => ({
      ...baseProduct,
      name: `${variation.color} ${baseProduct.name} - ${variation.size}`,
      color: variation.color,
      quantityAvailable: variation.quantity,
      productType: 'simple' as const
    }));

    const createdProducts = await this.Product.insertMany(products);
    return createdProducts as IProduct[];
  }

  async duplicateProduct(productId: string, modifications: any): Promise<IProduct> {
    const originalProduct = await this.Product.findById(productId);
    if (!originalProduct) throw new AppError('Product not found', 404);

    const duplicatedData = {
      ...originalProduct.toObject(),
      _id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      ...modifications
    };

    const duplicatedProduct = await this.Product.create(duplicatedData);
    return duplicatedProduct;
  }

  //private functions
  private async verifyUser(userId: string) {
    return await this.verifyDoc(userId, this.User);
  }

  private async verifySeller(sellerId: string) {
    return await this.verifyDoc(sellerId, this.Seller);
  }

  private async verifyProduct(productId: string) {
    return await this.verifyDoc(productId, this.Product);
  }
}
