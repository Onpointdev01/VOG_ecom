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
import { NotificationService } from './NotificationService';

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
    limit: number
  ): Promise<{products: IProduct[]; total: number; totalPages: number; currentPage: number}>;
  updateProduct(id: string, payload: Partial<IProduct>): Promise<IProduct>;
  deleteProduct(id: string): Promise<void>;
  reviewProduct(review: createReviewDTO): Promise<IReview>;
}

@injectable()
export class ProductService extends BaseService implements IProductService {
  private notificationService?: NotificationService;

  constructor(
    @inject(TYPES.Product) private Product: Model<IProduct>,
    @inject(TYPES.ProductVariant) private ProductVariant: Model<IProductVariant>,
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Review) private Review: Model<IReview>,
    @inject(TYPES.Seller) private Seller: Model<ISeller>
  ) {
    super();
  }

  /**
   * Set notification service (called after NotificationService is initialized)
   */
  setNotificationService(notificationService: NotificationService): void {
    this.notificationService = notificationService;
  }

  async createProduct(payload: createProductDTO): Promise<IProduct> {
    // Check if product exists by name or another unique identifier
    // const existingProduct = await this.Product.findOne({ name });
    // if (existingProduct) throw new AppError('Product already exists', 400);
    await this.verifySeller(payload.owner.toString());
    const newProduct = await this.Product.create(payload);
    
    // Notify admins of new product
    try {
      const seller = await this.Seller.findById(payload.owner).populate('user');
      const sellerName = seller ? (seller as any).name || 'Unknown Seller' : 'Unknown Seller';
      
      if (this.notificationService) {
        await this.notificationService.sendNewProductNotificationToAdmins(
          (newProduct._id as string).toString(),
          newProduct.name,
          sellerName,
          newProduct.productType || 'simple'
        );
      }
    } catch (error) {
      console.error('Failed to send new product notification to admins:', error);
      // Don't throw - notification failure shouldn't fail product creation
    }
    
    return newProduct;
  }

  async getProductById(id: string): Promise<any> {
    const product = await this.Product.findById(id).lean();
    if (!product) throw new AppError('Product not found', 404);

    // Populate owner/seller data
    let ownerData = null;
    if (product.owner) {
      const seller = await this.Seller.findById(product.owner).lean();
      if (seller) {
        ownerData = {
          id: (seller._id as any).toString(),
          name: seller.name,
          rating: seller.rating,
          logo: seller.logo,
          official: seller.official,
        };
      }
    }

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
    if (product.productType === 'variable') {
      const variants = await this.ProductVariant.find({
        product: id,
        isActive: true
      }).select('sku size color price originalPrice quantityAvailable images');

      return {
        ...product,
        id: product._id.toString(),
        _id: undefined,
        owner: ownerData,
        attributes: populatedAttributes,
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
      owner: ownerData,
      attributes: populatedAttributes,
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
    
    // Search handling - use regex search which always works
    if (search && search.trim()) {
      const searchTerm = search.trim();
      // Escape special regex characters to prevent errors
      const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Create regex pattern string for MongoDB (not RegExp object)
      const regexPattern = escapedSearchTerm;
      
      // Use regex search which works without requiring text index
      // This searches in name, description, and brand fields
      aggregationPipeline.push({
        $match: {
          $and: [
            {
              $or: [
                { name: { $regex: regexPattern, $options: 'i' } },
                { description: { $regex: regexPattern, $options: 'i' } },
                { brand: { $regex: regexPattern, $options: 'i' } }
              ]
            },
            filter
          ]
        }
      });
      
      // Add relevance score based on where the match was found
      // Name matches are most relevant, then brand, then description
      aggregationPipeline.push({
        $addFields: {
          score: {
            $add: [
              { 
                $cond: [
                  { $regexMatch: { input: '$name', regex: regexPattern, options: 'i' } }, 
                  10, 
                  0
                ] 
              },
              { 
                $cond: [
                  { $regexMatch: { input: '$brand', regex: regexPattern, options: 'i' } }, 
                  5, 
                  0
                ] 
              },
              { 
                $cond: [
                  { $regexMatch: { input: '$description', regex: regexPattern, options: 'i' } }, 
                  1, 
                  0
                ] 
              }
            ]
          }
        }
      });
    } else {
      // Non-search queries can start with regular match
      aggregationPipeline.push({
        $match: filter
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
      }
    );
    
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

    // Add sorting based on options or search relevance or default
    const sortBy = options?.sortBy || 'createdAt';
    const sortOrder = options?.sortOrder === 'asc' ? 1 : -1;
    
    const sortObj: any = {};
    
    // For search results, prioritize relevance score if available
    if (search && (!sortBy || sortBy === 'relevance' || sortBy === 'newest')) {
      // If we have a score field (from text search), use it as primary sort
      if (search) {
        sortObj.score = -1; // Higher score = more relevant
      }
      
      // Add secondary sort based on options
      if (sortBy === 'newest') {
        sortObj.createdAt = -1;
      } else {
        sortObj.createdAt = -1; // Default: newest first for search results
      }
    } else {
      // Custom sorting for non-search or specific sort requests
      switch (sortBy) {
        case 'name':
          sortObj.name = sortOrder;
          break;
        case 'price':
        case 'price_asc':
        case 'price_desc':
          sortObj.computedPrice = sortBy === 'price_asc' ? 1 : -1;
          break;
        case 'rating':
          sortObj.rating = sortOrder;
          break;
        case 'popular':
        case 'popularity':
          sortObj.noOfReviews = sortOrder;
          break;
        case 'createdAt':
        case 'newest':
        default:
          sortObj.createdAt = sortOrder;
          break;
      }
    }
    
    aggregationPipeline.push({
      $sort: sortObj
    });

    // Add pagination if specified
    if (options?.page && options?.limit) {
      const skip = (options.page - 1) * options.limit;
      aggregationPipeline.push(
        { $skip: skip },
        { $limit: options.limit }
      );
    }

    // Execute aggregation
    // We're using regex search which always works, no try-catch needed
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
    // Use MongoDB text search for better performance and relevance
    const productSuggestions = await this.Product.aggregate([
      {
        $match: {
          isActive: true,
          $text: { $search: query }  // MongoDB text search
        }
      },
      {
        $addFields: {
          score: { $meta: 'textScore' }  // Add relevance score
        }
      },
      {
        $project: {
          name: 1,
          brand: 1,
          nameLower: { $toLower: '$name' },
          score: 1
        }
      },
      {
        $group: {
          _id: '$nameLower',
          name: { $first: '$name' },
          brand: { $first: '$brand' },
          score: { $max: '$score' }  // Keep highest relevance score
        }
      },
      {
        $sort: { score: -1, name: 1 }  // Sort by relevance, then alphabetically
      },
      {
        $limit: 8  // Reduced limit since text search is more accurate
      }
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

      // Match active products and category filter
      {
        $match: {
          $and: [
            { isActive: true },
            categoryFilter
          ]
        },
      },

      // Lookup owner/seller data
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
    limit: number
  ): Promise<{products: IProduct[]; total: number; totalPages: number; currentPage: number}> {
    const skip = (page - 1) * limit;

    // Verify seller exists
    await this.verifySeller(sellerId);

    const aggregationPipeline: any[] = [
      // Match products by seller/owner
      {
        $match: {
          owner: new mongoose.Types.ObjectId(sellerId),
          isActive: true
        }
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

      // Lookup variants for variable products
      {
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
      },

      // Add computed fields
      {
        $addFields: {
          computedPrice: {
            $cond: {
              if: { $eq: ['$productType', 'variable'] },
              then: {
                $cond: {
                  if: { $gt: [{ $size: '$variants' }, 0] },
                  then: { $min: '$variants.price' },
                  else: '$price'
                }
              },
              else: '$price'
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
          }
        }
      },

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
    
    // Notify admins of new product
    try {
      const seller = await this.Seller.findById(payload.owner).populate('user');
      const sellerName = seller ? (seller as any).name || 'Unknown Seller' : 'Unknown Seller';
      
      if (this.notificationService) {
        await this.notificationService.sendNewProductNotificationToAdmins(
          (newProduct._id as string).toString(),
          newProduct.name,
          sellerName,
          'simple'
        );
      }
    } catch (error) {
      console.error('Failed to send new product notification to admins:', error);
      // Don't throw - notification failure shouldn't fail product creation
    }
    
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

      // Notify admins of new product
      try {
        const seller = await this.Seller.findById(product.owner).populate('user');
        const sellerName = seller ? (seller as any).name || 'Unknown Seller' : 'Unknown Seller';
        
        if (this.notificationService) {
          await this.notificationService.sendNewProductNotificationToAdmins(
            (variableProduct._id as string).toString(),
            variableProduct.name,
            sellerName,
            'variable'
          );
        }
      } catch (error) {
        console.error('Failed to send new product notification to admins:', error);
        // Don't throw - notification failure shouldn't fail product creation
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
