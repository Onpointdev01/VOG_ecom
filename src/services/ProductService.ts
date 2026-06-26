/* eslint-disable @typescript-eslint/no-explicit-any */
import { inject, injectable } from 'inversify';
import { FilterQuery, Model } from 'mongoose';
import mongoose from 'mongoose';
import TYPES from '../di';
import { IProduct } from '../models/Product';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import { createProductDTO, createReviewDTO, getAllProductsResponse } from '../utils/dtos';
import { IReview, IUser, IProductVariant, ProductVariant, ISeller } from '../models';
import {
  inStockOnlyMatch,
  publicListingBaseMatch,
  sellerLookupStages,
  totalStockStage,
  variantsLookupStage,
} from '../utils/productListingPipeline';
import {
  canViewProductPage,
  enrichProductAvailability,
  isVariableProductType,
} from '../utils/productAvailability';
import {
  VariantCombinationInput,
  VariantConfigInput,
  mergeVariantRowsWithConfig,
  normalizeStringList,
} from '../utils/variantUtils';

export interface IProductService {
  createProduct(payload: createProductDTO): Promise<IProduct>;
  createSimpleProduct(payload: createProductDTO): Promise<IProduct>;
  createVariableProduct(payload: any): Promise<IProduct>;
  bulkCreateSimpleProducts(payload: any): Promise<IProduct[]>;
  duplicateProduct(productId: string, modifications: any): Promise<IProduct>;
  getProductById(
    id: string,
    options?: { skipAvailabilityCheck?: boolean; includeInactiveVariants?: boolean }
  ): Promise<IProduct>;
  getAllProducts(
    filter: FilterQuery<IProduct>,
    category?: string,
    search?: string,
    user?: IUser,
    options?: {
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    }
  ): Promise<any[]>;
  getSearchSuggestions(query: string): Promise<string[]>;
  getProductsByCategoryId(
    categoryId: string,
    includeSubcategories: boolean,
    page: number,
    limit: number
  ): Promise<{products: IProduct[]; total: number; totalPages: number; currentPage: number}>;
  getProductsBySellerId(
    sellerId: string,
    page: number,
    limit: number,
    options?: { search?: string; isActive?: boolean; category?: string }
  ): Promise<{products: IProduct[]; total: number; totalPages: number; currentPage: number}>;
  updateProduct(id: string, payload: Partial<IProduct>): Promise<IProduct>;
  updateProductWithVariants(productId: string, sellerId: string, payload: any): Promise<any>;
  getSellerOwnedProduct(productId: string, sellerId: string): Promise<any>;
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

  async getProductById(
    id: string,
    options?: { skipAvailabilityCheck?: boolean; includeInactiveVariants?: boolean }
  ): Promise<any> {
    const product = await this.Product.findById(id).lean();
    if (!product) throw new AppError('Product not found', 404);
    if (!product.owner) {
      throw new AppError('Product not found', 404);
    }

    const seller = await this.Seller.findById(product.owner).lean();
    if (!seller) {
      throw new AppError('Product not found', 404);
    }

    const ownerData = {
      id: (seller._id as any).toString(),
      name: seller.name,
      rating: seller.rating,
      logo: seller.logo,
      official: seller.official,
      status: seller.status,
    };

    // Populate attributes if they exist
    let populatedAttributes = product.attributes;
    if (product.attributes && product.attributes.length > 0) {
      const Attribute = this.Product.db.model('Attribute');
      const AttributeValue = this.Product.db.model('AttributeValue');

      populatedAttributes = await Promise.all(
        product.attributes.map(async (attr: any) => {
          const attribute = await Attribute.findById(attr.attribute).lean();
          const value = await AttributeValue.findById(attr.value).lean();
          return {
            attribute: attribute || attr.attribute,
            value: value || attr.value,
          };
        })
      );
    }

    // If it's a variable product, populate variants
    if (isVariableProductType(product.productType)) {
      const variantFilter: Record<string, unknown> = { product: id };
      if (!options?.includeInactiveVariants) {
        variantFilter.isActive = true;
      }
      const variants = await this.ProductVariant.find(variantFilter).select(
        'sku size color price originalPrice quantityAvailable images isActive'
      );

      const payload = {
        ...product,
        id: product._id.toString(),
        _id: undefined,
        owner: ownerData,
        attributes: populatedAttributes,
        variants: variants.map((v) => ({
          ...v.toObject(),
          id: (v._id as any).toString(),
          _id: undefined,
        })),
        priceRange:
          variants.length > 0
            ? {
                min: Math.min(...variants.map((v) => v.price)),
                max: Math.max(...variants.map((v) => v.price)),
              }
            : null,
        totalStock: variants.reduce((sum, v) => sum + (v.quantityAvailable || 0), 0),
        quantityAvailable: variants.reduce((sum, v) => sum + (v.quantityAvailable || 0), 0),
        availableColors: Array.from(new Set(variants.map((v) => v.color).filter(Boolean))),
        availableSizes: Array.from(new Set(variants.map((v) => v.size).filter(Boolean))),
        variantConfig: product.variantConfig || {
          hasSizes: variants.some((v) => Boolean(v.size)),
          hasColors: variants.some((v) => Boolean(v.color)),
          sizes: Array.from(new Set(variants.map((v) => v.size).filter(Boolean))),
          colors: Array.from(new Set(variants.map((v) => v.color).filter(Boolean))),
        },
      };

      if (!options?.skipAvailabilityCheck && !canViewProductPage({ product: payload, seller })) {
        throw new AppError('Product not found', 404);
      }

      return enrichProductAvailability(payload, seller);
    }

    const payload = {
      ...product,
      id: (product._id as any).toString(),
      _id: undefined,
      owner: ownerData,
      attributes: populatedAttributes,
      variants: [],
      priceRange: null,
      totalStock: product.quantityAvailable || 0,
      availableColors: product.color ? [product.color] : [],
      availableSizes: [],
    };

    if (!options?.skipAvailabilityCheck && !canViewProductPage({ product: payload, seller })) {
      throw new AppError('Product not found', 404);
    }

    return enrichProductAvailability(payload, seller);
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
    user?: IUser,
    options?: {
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    }
  ): Promise<any[]> {
    let categoryMatch = {};
    if (category) {
      categoryMatch = { 'categoryData.name': category };
    }
    const aggregationPipeline: any[] = [];
    
    // Atlas Search supports prefix/autocomplete; $text only matches whole words
    if (search) {
      aggregationPipeline.push({
        $search: {
          index: 'products_search',
          compound: {
            should: [
              {
                autocomplete: {
                  query: search,
                  path: 'name',
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 10 } },
                },
              },
              {
                autocomplete: {
                  query: search,
                  path: 'brand',
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 5 } },
                },
              },
              {
                text: {
                  query: search,
                  path: 'description',
                  score: { boost: { value: 1 } },
                },
              },
            ],
            minimumShouldMatch: 1,
          },
        },
      });

      aggregationPipeline.push({
        $addFields: { score: { $meta: 'searchScore' } },
      });

      // Apply non-search filters after $search
      const extraFilters: any[] = [publicListingBaseMatch];
      if (Object.keys(filter).length > 0) extraFilters.push(filter);
      aggregationPipeline.push({ $match: { $and: extraFilters } });
    } else {
      aggregationPipeline.push({
        $match: {
          $and: [publicListingBaseMatch, filter],
        },
      });
    }
    
    // Add category lookup and filtering
    aggregationPipeline.push(
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryData',
        },
      },
      { $unwind: '$categoryData' }
    );
    
    // Add category match if specified
    if (category) {
      aggregationPipeline.push({
        $match: categoryMatch
      });
    }
    
    aggregationPipeline.push(
      ...sellerLookupStages,
      variantsLookupStage,
      totalStockStage,
      inStockOnlyMatch,
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
          productType: 1,
          quantityAvailable: 1,
          totalStock: 1,
          variants: 1,
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
          brand: '$brand',
          condition: '$condition',
          color: '$color',
        },
      }
    );

    // If the user is authenticated, check their wishlist
    if (user) {
      aggregationPipeline.push({
        $addFields: {
          isWishlist: {
            $cond: {
              if: {
                $in: ['$_id', user.wishlist],
              },
              then: true,
              else: false,
            },
          },
        },
      });
    }

    // Computed display fields (after stock filter; productType/qty still on document)
    aggregationPipeline.push({
      $addFields: {
        computedPrice: {
          $cond: {
            if: { $in: ['$productType', ['variable', 'variant']] },
            then: {
              $cond: {
                if: { $gt: [{ $size: '$variants' }, 0] },
                then: { $min: '$variants.price' },
                else: '$price',
              },
            },
            else: '$price',
          },
        },
        priceRange: {
          $cond: {
            if: {
              $and: [
                { $in: ['$productType', ['variable', 'variant']] },
                { $gt: [{ $size: '$variants' }, 0] },
              ],
            },
            then: {
              min: { $min: '$variants.price' },
              max: { $max: '$variants.price' },
            },
            else: null,
          },
        },
        availableColors: {
          $cond: {
            if: { $in: ['$productType', ['variable', 'variant']] },
            then: { $setUnion: ['$variants.color', []] },
            else: { $cond: { if: '$color', then: ['$color'], else: [] } },
          },
        },
        availableSizes: {
          $cond: {
            if: { $in: ['$productType', ['variable', 'variant']] },
            then: { $setUnion: ['$variants.size', []] },
            else: [],
          },
        },
      },
    });

    // Add sorting based on options or search relevance or default
    if (search && (!options?.sortBy || options.sortBy === 'relevance')) {
      aggregationPipeline.push({
        $sort: { score: -1, _id: 1 },
      });
    } else {
      // Custom sorting
      const sortBy = options?.sortBy || 'createdAt';
      const sortOrder = options?.sortOrder === 'asc' ? 1 : -1;
      
      const sortObj: any = {};
      
      switch (sortBy) {
        case 'name':
          sortObj.name = sortOrder;
          break;
        case 'price':
          sortObj.computedPrice = sortOrder;
          break;
        case 'rating':
          sortObj.rating = sortOrder;
          break;
        case 'popularity':
          sortObj.noOfReviews = sortOrder;
          break;
        case 'createdAt':
        default:
          sortObj.createdAt = sortOrder;
          break;
      }
      
      aggregationPipeline.push({
        $sort: sortObj
      });
    }

    // Add pagination if specified
    if (options?.page && options?.limit) {
      const skip = (options.page - 1) * options.limit;
      aggregationPipeline.push(
        { $skip: skip },
        { $limit: options.limit }
      );
    }

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

  async getSearchSuggestions(query: string): Promise<string[]> {
    const productSuggestions = await this.Product.aggregate([
      {
        $search: {
          index: 'products_search',
          compound: {
            should: [
              {
                autocomplete: {
                  query,
                  path: 'name',
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 10 } },
                },
              },
              {
                autocomplete: {
                  query,
                  path: 'brand',
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 5 } },
                },
              },
            ],
            minimumShouldMatch: 1,
          },
        },
      },
      { $match: publicListingBaseMatch },
      ...sellerLookupStages,
      variantsLookupStage,
      totalStockStage,
      inStockOnlyMatch,
      {
        $addFields: { score: { $meta: 'searchScore' } },
      },
      {
        $project: {
          name: 1,
          brand: 1,
          nameLower: { $toLower: '$name' },
          score: 1,
        },
      },
      {
        $group: {
          _id: '$nameLower',
          name: { $first: '$name' },
          brand: { $first: '$brand' },
          score: { $max: '$score' },
        },
      },
      { $sort: { score: -1, name: 1 } },
      { $limit: 8 },
    ]);

    // Extract smart, concise suggestions
    const suggestions: string[] = [];
    const queryLower = query.toLowerCase();
    const addedSuggestions = new Set<string>();
    
    // Helper function to extract meaningful product name parts
    const extractSmartSuggestion = (productName: string): string[] => {
      const smartSuggestions: string[] = [];
      
      // Clean and split the product name
      const cleanName = productName
        .replace(/,.*$/, '') // Remove everything after first comma
        .replace(/\s*-\s*.*$/, '') // Remove everything after dash
        .replace(/\s*\(.*?\)/g, '') // Remove content in parentheses
        .trim();
      
      const words = cleanName.split(' ');
      
      // Extract progressive suggestions (brand + model + series)
      if (words.length >= 2) {
        // Brand + first word: "Apple Watch"
        smartSuggestions.push(`${words[0]} ${words[1]}`);
        
        if (words.length >= 3) {
          // Brand + model + series: "Apple Watch Series"
          smartSuggestions.push(`${words[0]} ${words[1]} ${words[2]}`);
          
          if (words.length >= 4 && words[3].match(/^\d+$/)) {
            // Include numbers: "Apple Watch Series 10"
            smartSuggestions.push(`${words[0]} ${words[1]} ${words[2]} ${words[3]}`);
          }
        }
      }
      
      return smartSuggestions;
    };
    
    // Add smart product suggestions
    for (const product of productSuggestions) {
      const productName = product.name;
      const smartSuggestions = extractSmartSuggestion(productName);
      
      for (const suggestion of smartSuggestions) {
        const suggestionLower = suggestion.toLowerCase();
        if (!addedSuggestions.has(suggestionLower) && 
            suggestionLower.includes(queryLower)) {
          suggestions.push(suggestion);
          addedSuggestions.add(suggestionLower);
        }
      }
      
      // Add brand-based suggestions
      if (product.brand && product.brand.toLowerCase().includes(queryLower)) {
        const brandSuggestions = [
          `${product.brand} accessories`,
          `${product.brand} case`,
          `${product.brand} cover`
        ];
        
        for (const brandSuggestion of brandSuggestions) {
          const brandLower = brandSuggestion.toLowerCase();
          if (!addedSuggestions.has(brandLower)) {
            suggestions.push(brandSuggestion);
            addedSuggestions.add(brandLower);
          }
        }
      }
    }
    
    // Add intelligent category-based suggestions only if we have real product context
    if (suggestions.length < 6 && suggestions.length > 0) {
      const getSmartVariations = (searchTerm: string): string[] => {
        const term = searchTerm.toLowerCase();
        
        // Analyze actual product results to determine context
        const productContext = {
          hasApple: productSuggestions.some(p => 
            p.brand?.toLowerCase().includes('apple') || 
            p.name.toLowerCase().includes('apple')
          ),
          hasTech: productSuggestions.some(p => 
            ['samsung', 'sony', 'lg', 'microsoft', 'google'].some(brand => 
              p.brand?.toLowerCase().includes(brand)
            ) ||
            ['laptop', 'phone', 'tablet', 'computer', 'headphone'].some(tech => 
              p.name.toLowerCase().includes(tech)
            )
          ),
          hasClothing: productSuggestions.some(p => 
            ['jacket', 'shirt', 'dress', 'pants', 'jeans', 'hoodie', 'sweater'].some(clothing => 
              p.name.toLowerCase().includes(clothing)
            )
          )
        };
        
        // Electronics/Tech products get tech variations (only if actual tech products found)
        if (productContext.hasApple || productContext.hasTech || 
            ['iphone', 'samsung', 'apple', 'laptop', 'phone', 'tablet', 'airpods', 'macbook'].some(tech => term.includes(tech))) {
          return [
            `${searchTerm} pro`,
            `${searchTerm} plus`,
            `${searchTerm} mini`,
            `${searchTerm} max`,
            `${searchTerm} air`,
            `${searchTerm} ultra`
          ];
        }
        
        // Traditional watches and jewelry (only if no Apple context)
        if (term === 'watch' && !productContext.hasApple) {
          return [
            `${searchTerm} for men`,
            `${searchTerm} for women`,
            `digital ${searchTerm}`,
            `analog ${searchTerm}`,
            `luxury ${searchTerm}`,
            `sports ${searchTerm}`
          ];
        }
        
        // Clothing items get clothing variations
        if (['jacket', 'shirt', 'dress', 'pants', 'jeans', 'hoodie', 'sweater', 'coat', 'blazer', 'top'].some(clothing => term.includes(clothing))) {
          return [
            `${searchTerm} for men`,
            `${searchTerm} for women`,
            `${searchTerm} black`,
            `${searchTerm} white`,
            `${searchTerm} blue`,
            `leather ${searchTerm}`,
            `winter ${searchTerm}`,
            `casual ${searchTerm}`
          ];
        }
        
        // Shoes get shoe variations
        if (['shoe', 'sneaker', 'boot', 'sandal', 'heel', 'loafer'].some(shoe => term.includes(shoe))) {
          return [
            `${searchTerm} for men`,
            `${searchTerm} for women`,
            `running ${searchTerm}`,
            `casual ${searchTerm}`,
            `${searchTerm} black`,
            `${searchTerm} white`
          ];
        }
        
        // Home/furniture items
        if (['table', 'chair', 'sofa', 'bed', 'lamp', 'desk', 'shelf'].some(furniture => term.includes(furniture))) {
          return [
            `${searchTerm} wooden`,
            `${searchTerm} modern`,
            `${searchTerm} white`,
            `${searchTerm} black`,
            `office ${searchTerm}`,
            `dining ${searchTerm}`
          ];
        }
        
        // Generic accessories for other items
        return [
          `${searchTerm} accessories`,
          `${searchTerm} case`,
          `${searchTerm} cover`
        ];
      };
      
      const smartVariations = getSmartVariations(query);
      
      for (const variation of smartVariations) {
        const variationLower = variation.toLowerCase();
        if (!addedSuggestions.has(variationLower) && suggestions.length < 8) {
          suggestions.push(variation.charAt(0).toUpperCase() + variation.slice(1));
          addedSuggestions.add(variationLower);
        }
      }
    }

    return suggestions.slice(0, 8);
  }

  async getProductsByCategoryId(
    categoryId: string,
    includeSubcategories: boolean,
    page: number,
    limit: number
  ): Promise<{products: IProduct[]; total: number; totalPages: number; currentPage: number}> {
    const skip = (page - 1) * limit;

    // Convert categoryId to ObjectId for proper matching
    const categoryObjectId = new mongoose.Types.ObjectId(categoryId);

    // Build category filter
    let categoryFilter: any = { 'categoryData._id': categoryObjectId };

    if (includeSubcategories) {
      // Get all subcategories of the given category
      const Category = this.Product.db.model('Category');
      const subcategories = await Category.find({ parent: categoryObjectId });
      const subcategoryIds = subcategories.map(sub => sub._id);

      // Include main category and all its subcategories
      categoryFilter = {
        'categoryData._id': { $in: [categoryObjectId, ...subcategoryIds] }
      };
    }

    const aggregationPipeline: any[] = [
      // Lookup category data
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
          $and: [publicListingBaseMatch, categoryFilter],
        },
      },

      ...sellerLookupStages,
      variantsLookupStage,
      totalStockStage,
      inStockOnlyMatch,

      // Sort by creation date (newest first)
      { $sort: { createdAt: -1 } },

      // Add total count
      {
        $facet: {
          products: [
            { $skip: skip },
            { $limit: limit }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      }
    ];

    const result = await this.Product.aggregate(aggregationPipeline);
    const products = result[0].products || [];
    const total = result[0].totalCount[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      products,
      total,
      totalPages,
      currentPage: page,
    };
  }

  async getProductsBySellerId(
    sellerId: string,
    page: number,
    limit: number,
    options: { search?: string; isActive?: boolean; category?: string } = {}
  ): Promise<{products: IProduct[]; total: number; totalPages: number; currentPage: number}> {
    const skip = (page - 1) * limit;

    // Verify seller exists
    await this.verifySeller(sellerId);

    const matchConditions: Record<string, unknown>[] = [
      { owner: new mongoose.Types.ObjectId(sellerId) },
    ];
    if (options.isActive !== undefined) {
      matchConditions.push({ isActive: options.isActive });
    }
    if (options.category) {
      matchConditions.push({ category: new mongoose.Types.ObjectId(options.category) });
    }
    if (options.search?.trim()) {
      const term = options.search.trim();
      matchConditions.push({
        $or: [
          { name: { $regex: term, $options: 'i' } },
          { brand: { $regex: term, $options: 'i' } },
          { description: { $regex: term, $options: 'i' } },
        ],
      });
    }

    const aggregationPipeline: any[] = [
      {
        $match: { $and: matchConditions },
      },

      // Lookup category data
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryData',
        },
      },
      {
        $addFields: {
          category: {
            $cond: {
              if: { $eq: [{ $size: '$categoryData' }, 0] },
              then: null,
              else: { $arrayElemAt: ['$categoryData', 0] },
            },
          },
        },
      },

      // Lookup owner/seller data
      variantsLookupStage,
      totalStockStage,

      // Sort by creation date (newest first)
      { $sort: { createdAt: -1 } },

      // Add pagination and count
      {
        $facet: {
          products: [
            { $skip: skip },
            { $limit: limit }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      }
    ];

    const result = await this.Product.aggregate(aggregationPipeline);

    // Transform products to match expected format
    const products = (result[0].products || []).map((product: any) => ({
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
      attributes: product.attributes,
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
      })) || [],
      variantConfig: product.variantConfig || null,
      availableSizes: Array.from(
        new Set(
          (product.variants || [])
            .map((variant: { size?: string }) => variant.size)
            .filter(Boolean)
        )
      ),
      availableColors: Array.from(
        new Set(
          (product.variants || [])
            .map((variant: { color?: string }) => variant.color)
            .filter(Boolean)
        )
      ),
      createdAt: product.createdAt
    }));

    const total = result[0].totalCount[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      products,
      total,
      totalPages,
      currentPage: page,
    };
  }

  async updateProduct(id: string, payload: Partial<IProduct>): Promise<IProduct> {
    const updatedProduct = await this.Product.findByIdAndUpdate(id, payload, { new: true });
    if (!updatedProduct) throw new AppError('Product not found', 404);
    return updatedProduct;
  }

  async getSellerOwnedProduct(productId: string, sellerId: string): Promise<any> {
    const product = await this.Product.findOne({ _id: productId, owner: sellerId });
    if (!product) throw new AppError('Product not found', 404);
    return this.getProductById(productId, {
      skipAvailabilityCheck: true,
      includeInactiveVariants: true,
    });
  }

  async updateProductWithVariants(productId: string, sellerId: string, payload: any): Promise<any> {
    const existing = await this.Product.findOne({ _id: productId, owner: sellerId });
    if (!existing) throw new AppError('Product not found', 404);

    const productType = payload.productType || existing.productType;

    if (productType === 'simple') {
      const {
        variants: _v,
        variantConfig: _c,
        product: nested,
        ...simpleFields
      } = payload;
      const updateBody = nested || simpleFields;
      await this.ProductVariant.updateMany({ product: productId }, { isActive: false });
      Object.assign(existing, {
        ...updateBody,
        productType: 'simple',
        variantConfig: undefined,
      });
      await existing.save();
      return this.getProductById(productId);
    }

    if (productType !== 'variable') {
      throw new AppError('Invalid product type', 400);
    }

    const productFields = payload.product || payload;
    const {
      variants: _variants,
      variantConfig: incomingConfig,
      product: _nested,
      ...topLevelProduct
    } = payload;

    const variantConfig = this.normalizeVariantConfig(
      incomingConfig || productFields.variantConfig || existing.variantConfig
    );

    const basePrice = Number(productFields.basePrice ?? payload.basePrice ?? 0);
    const baseOriginalPrice = Number(
      productFields.baseOriginalPrice ?? payload.baseOriginalPrice ?? basePrice
    );

    const mergedRows = mergeVariantRowsWithConfig(
      variantConfig,
      (payload.variants || []) as VariantCombinationInput[],
      basePrice,
      baseOriginalPrice
    );

    if (mergedRows.length === 0) {
      throw new AppError('Variable products must have at least one variant', 400);
    }

    const { price, originalPrice, color, quantityAvailable, condition, variants, variantConfig: _vc, basePrice: _bp, baseOriginalPrice: _bop, ...safeProduct } =
      productFields;

    Object.assign(existing, {
      ...topLevelProduct,
      ...safeProduct,
      productType: 'variable',
      variantConfig,
      price: undefined,
      quantityAvailable: undefined,
      condition: undefined,
    });
    await existing.save();

    await this.syncVariantsForProduct(productId, mergedRows);

    return this.getProductById(productId);
  }

  private normalizeVariantConfig(config?: VariantConfigInput | null) {
    const hasSizes = Boolean(config?.hasSizes);
    const hasColors = Boolean(config?.hasColors);
    return {
      hasSizes,
      hasColors,
      sizes: hasSizes ? normalizeStringList(config?.sizes) : [],
      colors: hasColors ? normalizeStringList(config?.colors) : [],
    };
  }

  private async syncVariantsForProduct(
    productId: string,
    rows: VariantCombinationInput[]
  ): Promise<void> {
    const existingVariants = await this.ProductVariant.find({ product: productId });
    const byId = new Map(existingVariants.map((v) => [String(v._id), v]));

    const keepIds = new Set<string>();

    for (const row of rows) {
      const price = Number(row.price) >= 0 ? Number(row.price) : 0;
      const originalPrice =
        Number(row.originalPrice) >= 0 ? Number(row.originalPrice) : price;
      const quantityAvailable = Math.max(0, Number(row.quantityAvailable ?? 0));

      if (row.id && byId.has(row.id)) {
        const doc = byId.get(row.id)!;
        doc.size = row.size;
        doc.color = row.color;
        doc.price = price;
        doc.originalPrice = originalPrice;
        doc.quantityAvailable = quantityAvailable;
        doc.images = row.images || doc.images || [];
        if (row.sku) doc.sku = row.sku;
        doc.isActive = true;
        await doc.save();
        keepIds.add(row.id);
        continue;
      }

      const created = await new this.ProductVariant({
        product: productId,
        size: row.size,
        color: row.color,
        price,
        originalPrice,
        quantityAvailable,
        images: row.images || [],
        sku: row.sku,
        isActive: true,
      }).save();
      keepIds.add(String(created._id));
    }

    for (const variant of existingVariants) {
      const id = String(variant._id);
      if (!keepIds.has(id)) {
        variant.isActive = false;
        await variant.save();
      }
    }
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
      const productPayload = payload.product || payload;
      await this.verifySeller(productPayload.owner.toString());

      const variantConfig = this.normalizeVariantConfig(
        payload.variantConfig || productPayload.variantConfig
      );

      const basePrice = Number(payload.basePrice ?? productPayload.basePrice ?? 0);
      const baseOriginalPrice = Number(
        payload.baseOriginalPrice ?? productPayload.baseOriginalPrice ?? basePrice
      );

      const variantRows =
        payload.variants && payload.variants.length > 0
          ? mergeVariantRowsWithConfig(
              variantConfig,
              payload.variants as VariantCombinationInput[],
              basePrice,
              baseOriginalPrice
            )
          : mergeVariantRowsWithConfig(variantConfig, [], basePrice, baseOriginalPrice);

      if (variantRows.length === 0) {
        throw new AppError('Variable products must have at least one variant', 400);
      }

      const {
        price,
        originalPrice,
        color,
        quantityAvailable,
        condition,
        variants: _v,
        variantConfig: _vc,
        basePrice: _bp,
        baseOriginalPrice: _bop,
        ...productData
      } = productPayload;

      const variableProduct = await this.Product.create({
        ...productData,
        productType: 'variable',
        images: productPayload.images || [],
        variantConfig,
      });

      const createdVariants = [];
      for (const variantInfo of variantRows) {
        const variant = new this.ProductVariant({
          ...variantInfo,
          product: variableProduct._id,
        });
        const savedVariant = await variant.save();
        createdVariants.push(savedVariant);
      }

      return {
        ...variableProduct.toObject(),
        variants: createdVariants,
      } as any;
    } catch (error: any) {
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
