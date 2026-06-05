import { injectable } from 'inversify';
import jwt from 'jsonwebtoken';
import { BaseService } from './BaseService';
import { Admin, IAdmin } from '../models/Admin';
import { User, IUser } from '../models/User';
import { Category, ICategory } from '../models/newCategory';
import { Brand, IBrand } from '../models/Brand';
import { Product, IProduct } from '../models/Product';
import { Order, IOrder } from '../models/Order';
import { Seller, ISeller } from '../models/Seller';
import AppError from '../utils/errors/AppError';
import { env } from '../config';
import { resolveSellerUserId } from '../utils/resolveSellerUser';
import { boutiqueFeedSortStages, PLATFORM_STORE_NAME } from '../utils/sellerPromotion';
import { applyExcludeCancelledFromOrderList } from '../utils/orderListFilters';

export interface IAdminService {
  createAdmin(data: CreateAdminRequest): Promise<IAdmin>;
  signInAdmin(email: string, password: string): Promise<{ admin: IAdmin; token: string }>;
  checkAdminStatus(adminId: string): Promise<IAdmin | null>;
  getAllAdmins(): Promise<IAdmin[]>;
  updateAdminStatus(adminId: string, isActive: boolean): Promise<IAdmin>;
  updateAdmin(adminId: string, data: Partial<IAdmin>): Promise<IAdmin>;
  deleteAdmin(adminId: string): Promise<void>;
  
  // User Management
  getAllUsers(filters: any, page: number, limit: number): Promise<{ users: IUser[]; total: number; totalPages: number; currentPage: number }>;
  updateUserBanStatus(userId: string, banned: boolean, banReason?: string, banExpires?: Date): Promise<IUser>;
  getUserById(userId: string): Promise<IUser>;
  updateUserById(userId: string, data: Partial<IUser>): Promise<IUser>;
  updateSellerForUser(userId: string, data: Record<string, unknown>): Promise<ISeller>;
  listSellersForAdmin(
    page: number,
    limit: number,
    search?: string
  ): Promise<{ sellers: Record<string, unknown>[]; total: number; totalPages: number; currentPage: number }>;
  updateSellerById(sellerId: string, data: Record<string, unknown>): Promise<ISeller>;
  
  // Category Management
  getAllCategories(): Promise<ICategory[]>;
  createCategory(data: { name: string; description?: string; parent?: string | null; isActive?: boolean; imageUrl?: string }): Promise<ICategory>;
  updateCategory(categoryId: string, data: { name?: string; description?: string; parent?: string | null; isActive?: boolean; imageUrl?: string }): Promise<ICategory>;
  deleteCategory(categoryId: string): Promise<void>;
  
  // Brand Management
  getAllBrands(): Promise<IBrand[]>;
  createBrand(data: { name: string; description?: string; logoUrl?: string; website?: string; isActive?: boolean }): Promise<IBrand>;
  updateBrand(brandId: string, data: { name?: string; description?: string; logoUrl?: string; website?: string; isActive?: boolean }): Promise<IBrand>;
  deleteBrand(brandId: string): Promise<void>;
  
  // Product Management
  getAllProducts(filters: any, page: number, limit: number): Promise<{ products: IProduct[]; total: number; totalPages: number; currentPage: number }>;
  createProduct(data: any): Promise<IProduct>;
  updateProductStatus(productId: string, isActive: boolean): Promise<IProduct>;
  updateProductFeatured(productId: string, data: { isRecommended?: boolean; isFlash?: boolean }): Promise<IProduct>;
  deleteProduct(productId: string): Promise<void>;
  
  // Order Management
  getAllOrders(filters: any, page: number, limit: number): Promise<{ orders: IOrder[]; total: number; totalPages: number; currentPage: number }>;
  updateOrderStatus(orderId: string, orderStatus: string): Promise<IOrder>;
  updateOrderPaymentStatus(orderId: string, paymentStatus: string): Promise<IOrder>;
  getOrderDetails(orderId: string): Promise<IOrder>;
  getOrderPaymentStats(): Promise<{
    totalPayments: number;
    totalAmount: number;
    completedPayments: number;
    failedPayments: number;
    pendingPayments: number;
    byMethod: { _id: string; count: number; totalAmount: number; successCount: number }[];
  }>;
  getOrderStats(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    outForDelivery: number;
    complete: number;
    cancelled: number;
  }>;
  
  // Bid-related User Management
  banUserFromBidding(userId: string, reason: string, expiresAt?: Date): Promise<IUser>;
  unbanUserFromBidding(userId: string): Promise<IUser>;
}

export interface CreateAdminRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role?: 'SUPER_ADMIN' | 'ADMIN';
}

@injectable()
export class AdminService extends BaseService implements IAdminService {
  
  async createAdmin(data: CreateAdminRequest): Promise<IAdmin> {
    const { firstName, lastName, email, password, role = 'ADMIN' } = data;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      throw new AppError('Admin with this email already exists', 400);
    }

    // Create new admin
    const admin = new Admin({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password,
      role,
      isActive: true,
    });

    await admin.save();
    return admin;
  }

  async signInAdmin(email: string, password: string): Promise<{ admin: IAdmin; token: string }> {
    // Find admin by email
    const admin = await Admin.findOne({ 
      email: email.toLowerCase().trim(),
      isActive: true 
    });

    if (!admin) {
      throw new AppError('Invalid email or password', 401);
    }

    // Check password
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate JWT token with admin userType
    const token = jwt.sign(
      { 
        id: admin._id, 
        email: admin.email,
        userType: 'admin',
        role: admin.role 
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES || '24h' }
    );

    return { admin, token };
  }

  async checkAdminStatus(adminId: string): Promise<IAdmin | null> {
    try {
      const admin = await Admin.findById(adminId);
      if (!admin || !admin.isActive) {
        return null;
      }
      return admin;
    } catch (error) {
      return null;
    }
  }

  async getAllAdmins(): Promise<IAdmin[]> {
    return Admin.find({ isActive: true })
      .select('-password')
      .sort({ createdAt: -1 });
  }

  async updateAdminStatus(adminId: string, isActive: boolean): Promise<IAdmin> {
    const admin = await this.verifyDoc(adminId, Admin);
    
    admin.isActive = isActive;
    await admin.save();
    
    return admin;
  }

  async updateAdmin(adminId: string, data: Partial<IAdmin>): Promise<IAdmin> {
    const admin = await this.verifyDoc(adminId, Admin);
    
    // Don't allow updating sensitive fields directly
    const allowedUpdates = ['firstName', 'lastName', 'role'];
    const updates = Object.keys(data).reduce((acc, key) => {
      if (allowedUpdates.includes(key)) {
        acc[key] = data[key as keyof IAdmin];
      }
      return acc;
    }, {} as any);

    Object.assign(admin, updates);
    await admin.save();
    
    return admin;
  }

  async deleteAdmin(adminId: string): Promise<void> {
    const admin = await this.verifyDoc(adminId, Admin);
    
    // Soft delete by setting isActive to false
    admin.isActive = false;
    await admin.save();
  }

  // Additional utility methods
  async changeAdminPassword(adminId: string, currentPassword: string, newPassword: string): Promise<void> {
    const admin = await this.verifyDoc(adminId, Admin);
    
    // Verify current password
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      throw new AppError('Current password is incorrect', 400);
    }

    // Update password
    admin.password = newPassword;
    await admin.save();
  }

  async resetAdminPassword(adminId: string, newPassword: string): Promise<void> {
    const admin = await this.verifyDoc(adminId, Admin);
    
    admin.password = newPassword;
    await admin.save();
  }

  // User Management Methods
  async getAllUsers(filters: any, page: number, limit: number): Promise<{ users: IUser[]; total: number; totalPages: number; currentPage: number }> {
    const skip = (page - 1) * limit;
    
    const users = await User.find(filters)
      .select('-password -refreshToken -verifyCode -passwordResetToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(
        'seller',
        'name type official logo status rating noOfRating isPinned isPlatformStore promotionActive promotionStartsAt promotionExpiresAt promotionActivatedAt promotionTier'
      )
      .lean();

    const total = await User.countDocuments(filters);
    const totalPages = Math.ceil(total / limit);

    return {
      users: users as IUser[],
      total,
      totalPages,
      currentPage: page,
    };
  }

  async updateUserBanStatus(userId: string, banned: boolean, banReason?: string, banExpires?: Date): Promise<IUser> {
    const user = await this.verifyDoc(userId, User);
    
    user.banned = banned;
    user.banReason = banned ? banReason || null : null;
    user.banExpires = banned && banExpires ? banExpires : null;
    
    await user.save();
    return user;
  }

  async getUserById(userId: string): Promise<IUser> {
    const user = await User.findById(userId)
      .select('-password -refreshToken -verifyCode -passwordResetToken')
      .populate(
        'seller',
        'name type official logo status rating noOfRating isPinned isPlatformStore promotionActive promotionStartsAt promotionExpiresAt promotionActivatedAt promotionTier'
      )
      .lean();

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user as IUser;
  }

  async updateUserById(userId: string, data: Partial<IUser>): Promise<IUser> {
    const user = await this.verifyDoc(userId, User);
    const allowed = [
      'firstName',
      'lastName',
      'phoneNumber',
      'nationality',
      'currentLocation',
      'profileImageUrl',
      'verified',
    ] as const;

    for (const key of allowed) {
      if (data[key] !== undefined) {
        (user as unknown as Record<string, unknown>)[key] = data[key];
      }
    }

    await user.save();
    return user;
  }

  private async applySellerAdminPatch(seller: ISeller, data: Record<string, unknown>): Promise<ISeller> {
    if (seller.isPlatformStore) {
      if (data.isPinned === false || data.promotionActive === true) {
        throw new AppError('Platform store pinning cannot be changed from promotion settings', 400);
      }
    }

    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new AppError('Shop name is required', 400);
      seller.name = name;
    }
    if (data.type !== undefined) {
      const type = String(data.type).toLowerCase();
      seller.type = type === 'company' || type === 'enterprise' ? 'company' : 'individual';
    }
    if (data.logo !== undefined) seller.logo = String(data.logo);
    if (data.status !== undefined) seller.status = String(data.status);
    if (data.official !== undefined) seller.official = Boolean(data.official);

    if (data.isPinned !== undefined && !seller.isPlatformStore) {
      seller.isPinned = Boolean(data.isPinned);
    }

    const activatingPromotion =
      data.promotionActive === true && !seller.promotionActive;

    if (data.promotionActive !== undefined && !seller.isPlatformStore) {
      seller.promotionActive = Boolean(data.promotionActive);
    }
    if (data.promotionStartsAt !== undefined) {
      seller.promotionStartsAt = data.promotionStartsAt
        ? new Date(String(data.promotionStartsAt))
        : undefined;
    }
    if (data.promotionExpiresAt !== undefined) {
      seller.promotionExpiresAt = data.promotionExpiresAt
        ? new Date(String(data.promotionExpiresAt))
        : undefined;
    }
    if (data.promotionTier !== undefined) {
      seller.promotionTier = Math.max(1, Number(data.promotionTier) || 1);
    }

    if (activatingPromotion) {
      seller.promotionActivatedAt = new Date();
    }

    if (seller.promotionExpiresAt && seller.promotionExpiresAt <= new Date()) {
      seller.promotionActive = false;
    }

    await seller.save();
    return seller;
  }

  async updateSellerForUser(userId: string, data: Record<string, unknown>): Promise<ISeller> {
    const user = await this.verifyDoc(userId, User);
    const seller = user.seller
      ? await Seller.findById(user.seller)
      : await Seller.findOne({ user: userId });

    if (!seller) {
      throw new AppError('Seller profile not found for this user', 404);
    }

    return this.applySellerAdminPatch(seller, data);
  }

  async updateSellerById(sellerId: string, data: Record<string, unknown>): Promise<ISeller> {
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      throw new AppError('Seller not found', 404);
    }
    return this.applySellerAdminPatch(seller, data);
  }

  async listSellersForAdmin(page: number, limit: number, search?: string) {
    const pageNumber = Math.max(1, page);
    const limitNumber = Math.min(100, Math.max(1, limit));
    const skip = (pageNumber - 1) * limitNumber;

    await Seller.updateMany(
      { promotionActive: true, promotionExpiresAt: { $lte: new Date() } },
      { $set: { promotionActive: false } }
    );

    const filter: Record<string, unknown> = { status: { $in: ['active', ''] } };
    if (search?.trim()) {
      filter.name = new RegExp(search.trim(), 'i');
    }

    const [total, rows] = await Promise.all([
      Seller.countDocuments(filter),
      Seller.aggregate([
        { $match: filter },
        ...boutiqueFeedSortStages(),
        { $skip: skip },
        { $limit: limitNumber },
        {
          $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'userDoc',
          },
        },
        { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
      ]),
    ]);

    const sellers = rows.map((row) => {
      const doc = row as Record<string, unknown>;
      const userDoc = doc.userDoc as Record<string, unknown> | undefined;
      return {
        id: String(doc._id),
        name: doc.name,
        logo: doc.logo,
        rating: doc.rating,
        noOfRating: doc.noOfRating,
        official: doc.official,
        status: doc.status,
        isPinned: doc.isPinned,
        isPlatformStore: doc.isPlatformStore,
        promotionActive: doc.promotionActive,
        promotionStartsAt: doc.promotionStartsAt,
        promotionExpiresAt: doc.promotionExpiresAt,
        promotionActivatedAt: doc.promotionActivatedAt,
        promotionTier: doc.promotionTier,
        ownerEmail: userDoc?.email,
        ownerName: userDoc
          ? `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim()
          : undefined,
      };
    });

    return {
      sellers,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNumber)),
      currentPage: pageNumber,
    };
  }

  // Category Management Methods
  async getAllCategories(): Promise<ICategory[]> {
    const categories = await Category.find()
      .populate('parent', 'name')
      .sort({ parent: 1, displayOrder: 1, createdAt: -1 });
    return categories.map((c) => c.toJSON() as ICategory);
  }

  async createCategory(data: {
    name: string;
    description?: string;
    parent?: string | null;
    isActive?: boolean;
    imageUrl?: string;
    attributes?: Array<{ attribute: string; isRequired?: boolean; displayOrder?: number }>;
  }): Promise<ICategory> {
    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${data.name}$`, 'i') } 
    });
    
    if (existingCategory) {
      throw new AppError('Category with this name already exists', 400);
    }

    // If parent is provided, verify it exists
    if (data.parent) {
      const parentCategory = await Category.findById(data.parent);
      if (!parentCategory) {
        throw new AppError('Parent category not found', 400);
      }
    }

    const category = new Category({
      name: data.name.trim(),
      description: data.description?.trim() ?? '',
      parent: data.parent ? (data.parent as any) : null,
      isActive: data.isActive !== undefined ? data.isActive : true,
      imageUrl: data.imageUrl?.trim() ?? '',
      attributes: Array.isArray(data.attributes) ? data.attributes : [],
    });

    await category.save();
    return category.toJSON() as ICategory;
  }

  async updateCategory(
    categoryId: string,
    data: {
      name?: string;
      description?: string;
      parent?: string | null;
      isActive?: boolean;
      imageUrl?: string;
      attributes?: Array<{ attribute: string; isRequired?: boolean; displayOrder?: number }>;
    }
  ): Promise<ICategory> {
    const category = await this.verifyDoc(categoryId, Category);
    
    if (data.name) {
      const existingCategory = await Category.findOne({ 
        name: { $regex: new RegExp(`^${data.name}$`, 'i') },
        _id: { $ne: categoryId }
      });
      
      if (existingCategory) {
        throw new AppError('Category with this name already exists', 400);
      }
      
      category.name = data.name.trim();
    }
    
    if (data.description !== undefined) {
      category.description = data.description?.trim();
    }

    if (data.parent !== undefined) {
      // Prevent circular references
      if (data.parent === categoryId) {
        throw new AppError('Category cannot be its own parent', 400);
      }

      // If parent is provided, verify it exists
      if (data.parent) {
        const parentCategory = await Category.findById(data.parent);
        if (!parentCategory) {
          throw new AppError('Parent category not found', 400);
        }

        // Check if setting this parent would create a circular reference
        const wouldCreateCircle = await this.checkCircularReference(categoryId, data.parent);
        if (wouldCreateCircle) {
          throw new AppError('Cannot set parent - would create circular reference', 400);
        }
      }

      category.parent = data.parent ? data.parent as any : null;
    }
    
    if (data.isActive !== undefined) {
      category.isActive = data.isActive;
    }

    if (data.imageUrl !== undefined) {
      category.imageUrl = data.imageUrl?.trim() ?? '';
    }

    if (data.attributes !== undefined) {
      category.attributes = data.attributes as any;
    }

    await category.save();
    return category.toJSON() as ICategory;
  }

  // Helper method to check for circular references in category hierarchy
  private async checkCircularReference(categoryId: string, potentialParentId: string): Promise<boolean> {
    let currentParentId = potentialParentId;
    const visited = new Set<string>();

    while (currentParentId && !visited.has(currentParentId)) {
      if (currentParentId === categoryId) {
        return true; // Circular reference found
      }

      visited.add(currentParentId);
      const parentCategory = await Category.findById(currentParentId);
      currentParentId = parentCategory?.parent?.toString() || '';
    }

    return false;
  }

  async deleteCategory(categoryId: string): Promise<void> {
    await this.verifyDoc(categoryId, Category);
    await Category.findByIdAndDelete(categoryId);
  }

  // Brand Management Methods
  async getAllBrands(): Promise<IBrand[]> {
    const brands = await Brand.find().sort({ createdAt: -1 });
    return brands.map((b) => b.toJSON() as IBrand);
  }

  async createBrand(data: { name: string; description?: string; logoUrl?: string; website?: string; isActive?: boolean }): Promise<IBrand> {
    const existingBrand = await Brand.findOne({ 
      name: { $regex: new RegExp(`^${data.name}$`, 'i') } 
    });
    
    if (existingBrand) {
      throw new AppError('Brand with this name already exists', 400);
    }

    const brand = new Brand({
      name: data.name.trim(),
      description: data.description?.trim(),
      logoUrl: data.logoUrl?.trim(),
      website: data.website?.trim(),
      isActive: data.isActive !== undefined ? data.isActive : true,
    });

    await brand.save();
    return brand.toJSON() as IBrand;
  }

  async updateBrand(brandId: string, data: { name?: string; description?: string; logoUrl?: string; website?: string; isActive?: boolean }): Promise<IBrand> {
    const brand = await this.verifyDoc(brandId, Brand);
    
    if (data.name) {
      const existingBrand = await Brand.findOne({ 
        name: { $regex: new RegExp(`^${data.name}$`, 'i') },
        _id: { $ne: brandId }
      });
      
      if (existingBrand) {
        throw new AppError('Brand with this name already exists', 400);
      }
      
      brand.name = data.name.trim();
    }
    
    if (data.description !== undefined) {
      brand.description = data.description?.trim();
    }
    
    if (data.logoUrl !== undefined) {
      brand.logoUrl = data.logoUrl?.trim();
    }
    
    if (data.website !== undefined) {
      brand.website = data.website?.trim();
    }
    
    if (data.isActive !== undefined) {
      brand.isActive = data.isActive;
    }

    await brand.save();
    return brand.toJSON() as IBrand;
  }

  async deleteBrand(brandId: string): Promise<void> {
    await this.verifyDoc(brandId, Brand);
    await Brand.findByIdAndDelete(brandId);
  }

  // Product Management Methods
  async getAllProducts(filters: any, page: number, limit: number): Promise<{ products: IProduct[]; total: number; totalPages: number; currentPage: number }> {
    const skip = (page - 1) * limit;
    
    const products = await Product.find(filters)
      .populate('category', 'name')
      .populate('owner', 'name type official')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Product.countDocuments(filters);
    const totalPages = Math.ceil(total / limit);

    return {
      products: products as IProduct[],
      total,
      totalPages,
      currentPage: page,
    };
  }

  private async getOrCreateSystemSeller(adminUserId?: string): Promise<ISeller> {
    let systemSeller = await Seller.findOne({ name: PLATFORM_STORE_NAME, type: 'company' });

    if (!systemSeller) {
      if (!adminUserId) {
        throw new AppError('Admin account required to initialize the platform store', 400);
      }
      systemSeller = await Seller.create({
        user: adminUserId,
        type: 'company',
        name: PLATFORM_STORE_NAME,
        logo: '',
        official: true,
        isPinned: true,
        isPlatformStore: true,
        promotionActive: false,
        status: 'active',
        products: [],
      });
    } else if (adminUserId && !systemSeller.user) {
      await Seller.updateOne({ _id: systemSeller._id }, { user: adminUserId });
      systemSeller = await Seller.findById(systemSeller._id);
      if (!systemSeller) {
        throw new AppError('Platform store could not be loaded', 500);
      }
    }

    if (!systemSeller.isPinned || !systemSeller.isPlatformStore) {
      systemSeller.isPinned = true;
      systemSeller.isPlatformStore = true;
      systemSeller.promotionActive = false;
      await systemSeller.save();
    }

    // Repair seller ↔ user link when possible; do not block product creation on failure.
    try {
      await resolveSellerUserId(systemSeller, User, Admin);
    } catch {
      // Legacy stores may have an invalid user ref; product creation can still proceed.
    }

    return systemSeller;
  }

  async createProduct(data: any): Promise<IProduct> {
    const systemSeller = await this.getOrCreateSystemSeller(data.adminUserId);

    if (data.productType === 'variable') {
      throw new AppError(
        'Variable products must be created from the seller dashboard with size/color variants',
        400
      );
    }

    const images = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
    if (images.length === 0) {
      throw new AppError('At least one product image is required', 400);
    }

    const price = Number(data.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new AppError('A valid price is required for simple products', 400);
    }

    const quantityAvailable = Number(data.quantityAvailable);
    if (!Number.isFinite(quantityAvailable) || quantityAvailable < 0) {
      throw new AppError('A valid quantity is required for simple products', 400);
    }

    const originalPriceRaw = data.originalPrice ?? price;
    const originalPrice = Number(originalPriceRaw);
    const condition = data.condition || 'Brand New';

    const product = await Product.create({
      name: data.name,
      description: data.description,
      productType: 'simple',
      category: data.category,
      brand: data.brand,
      price,
      originalPrice: Number.isFinite(originalPrice) && originalPrice >= 0 ? originalPrice : price,
      condition,
      color: data.color || undefined,
      quantityAvailable,
      images,
      attributes: data.attributes,
      isActive: data.isActive !== false,
      isFlash: Boolean(data.isFlash),
      isRecommended: Boolean(data.isRecommended),
      rating: 0,
      noOfReviews: 0,
      reviews: [],
      owner: systemSeller._id,
    });

    await Seller.updateOne(
      { _id: systemSeller._id },
      { $addToSet: { products: product._id } }
    );

    return product;
  }

  async updateProductStatus(productId: string, isActive: boolean): Promise<IProduct> {
    const product = await this.verifyDoc(productId, Product);
    
    product.isActive = isActive;
    await product.save();
    
    return product;
  }

  async updateProductFeatured(productId: string, data: { isRecommended?: boolean; isFlash?: boolean }): Promise<IProduct> {
    const product = await this.verifyDoc(productId, Product);
    
    if (data.isRecommended !== undefined) {
      product.isRecommended = data.isRecommended;
    }
    
    if (data.isFlash !== undefined) {
      product.isFlash = data.isFlash;
    }
    
    await product.save();
    return product;
  }

  async deleteProduct(productId: string): Promise<void> {
    await this.verifyDoc(productId, Product);
    await Product.findByIdAndDelete(productId);
  }

  // Order Management Methods
  async getAllOrders(filters: any, page: number, limit: number): Promise<{ orders: IOrder[]; total: number; totalPages: number; currentPage: number }> {
    const skip = (page - 1) * limit;
    const listFilters = applyExcludeCancelledFromOrderList(filters);

    const orders = await Order.find(listFilters)
      .populate('user', 'firstName lastName email')
      .populate('items.product', 'name price images')
      .populate('payments', 'transactionId paymentMethod status amount providerTransactionId createdAt')
      .populate('activePayment', 'transactionId paymentMethod status amount providerTransactionId createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments(listFilters);
    const totalPages = Math.ceil(total / limit);

    return {
      orders: orders as IOrder[],
      total,
      totalPages,
      currentPage: page,
    };
  }

  async updateOrderStatus(orderId: string, orderStatus: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    
    order.orderStatus = orderStatus as any;
    await order.save();
    
    return order;
  }

  async updateOrderPaymentStatus(orderId: string, paymentStatus: string): Promise<IOrder> {
    const order = await this.verifyDoc(orderId, Order);
    
    order.paymentStatus = paymentStatus as any;
    await order.save();
    
    return order;
  }

  async getOrderStats(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    outForDelivery: number;
    complete: number;
    cancelled: number;
  }> {
    const rows = await Order.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
        },
      },
    ]);

    const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
      if (row._id) acc[String(row._id)] = row.count;
      return acc;
    }, {});

    const pending = byStatus.PENDING ?? 0;
    const confirmed = byStatus.CONFIRMED ?? 0;
    const outForDelivery = byStatus.OUT_FOR_DELIVERY ?? 0;
    const complete = byStatus.COMPLETE ?? 0;
    const cancelled =
      (byStatus.CANCELLED ?? 0) + (byStatus.CANCELLED_BY_BUYER ?? 0);

    return {
      total: pending + confirmed + outForDelivery + complete + cancelled,
      pending,
      confirmed,
      outForDelivery,
      complete,
      cancelled,
    };
  }

  async getOrderPaymentStats(): Promise<{
    totalPayments: number;
    totalAmount: number;
    completedPayments: number;
    failedPayments: number;
    pendingPayments: number;
    byMethod: { _id: string; count: number; totalAmount: number; successCount: number }[];
  }> {
    const empty = {
      totalPayments: 0,
      totalAmount: 0,
      completedPayments: 0,
      failedPayments: 0,
      pendingPayments: 0,
      byMethod: [] as { _id: string; count: number; totalAmount: number; successCount: number }[],
    };

    const [overall] = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ['$finalPrice', '$totalPrice'] } },
          completedPayments: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'COMPLETED'] }, 1, 0] },
          },
          failedPayments: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'FAILED'] }, 1, 0] },
          },
          pendingPayments: {
            $sum: {
              $cond: [
                {
                  $in: [
                    { $ifNull: ['$paymentStatus', 'PENDING'] },
                    ['PENDING', 'PROCESSING'],
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const byMethod = await Order.aggregate([
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ['$finalPrice', '$totalPrice'] } },
          successCount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'COMPLETED'] }, 1, 0] },
          },
        },
      },
      { $sort: { count: -1 } },
    ]);

    if (!overall) {
      return empty;
    }

    return {
      totalPayments: overall.totalPayments ?? 0,
      totalAmount: overall.totalAmount ?? 0,
      completedPayments: overall.completedPayments ?? 0,
      failedPayments: overall.failedPayments ?? 0,
      pendingPayments: overall.pendingPayments ?? 0,
      byMethod: byMethod.filter((m) => m._id),
    };
  }

  async getOrderDetails(orderId: string): Promise<IOrder> {
    const order = await Order.findById(orderId)
      .populate('user', 'firstName lastName email phoneNumber')
      .populate('items.product', 'name price images brand description')
      .populate('payments', 'transactionId paymentMethod paymentType status amount currency providerTransactionId providerReference phoneNumber failureReason failureCode attemptedAt processedAt completedAt failedAt createdAt updatedAt')
      .populate('activePayment', 'transactionId paymentMethod paymentType status amount currency providerTransactionId providerReference phoneNumber failureReason failureCode attemptedAt processedAt completedAt failedAt createdAt updatedAt');

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    return order as IOrder;
  }

  // =====================================
  // BID-RELATED USER MANAGEMENT
  // =====================================

  /**
   * Ban a user from bidding
   */
  async banUserFromBidding(userId: string, reason: string, expiresAt?: Date): Promise<IUser> {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    user.offerBan = {
      isBanned: true,
      reason: reason,
      bannedAt: new Date(),
      expiresAt: expiresAt || null,
    };
    user.bidBan = user.offerBan;

    await user.save();
    return user;
  }

  /**
   * Unban a user from bidding
   */
  async unbanUserFromBidding(userId: string): Promise<IUser> {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    user.offerBan = {
      isBanned: false,
      reason: null,
      bannedAt: null,
      expiresAt: null,
      unbannedAt: new Date(),
    };
    user.bidBan = user.offerBan;

    await user.save();
    return user;
  }
}