import { injectable } from 'inversify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
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
  getUserDetails(userId: string): Promise<{ user: IUser; seller: ISeller | null }>;
  updateUserDetails(userId: string, payload: AdminUpdateUserPayload): Promise<IUser>;
  updateSellerByUserId(userId: string, payload: AdminUpdateSellerPayload): Promise<ISeller>;
  resetUserPassword(userId: string, newPassword: string): Promise<void>;
  updateUserBanStatus(userId: string, banned: boolean, banReason?: string, banExpires?: Date): Promise<IUser>;
  
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
  getOrderStats(): Promise<{ total: number; pending: number; confirmed: number; outForDelivery: number; complete: number; cancelled: number }>;
  updateOrderStatus(orderId: string, orderStatus: string): Promise<IOrder>;
  updateOrderPaymentStatus(orderId: string, paymentStatus: string): Promise<IOrder>;
  getOrderDetails(orderId: string): Promise<IOrder>;
  
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

/** Allowed fields for admin to update on a user (no password, no ban – use ban endpoint) */
export interface AdminUpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  nationality?: string;
  currentLocation?: string;
  profileImageUrl?: string;
  role?: string;
  verified?: boolean;
}

/** Allowed fields for admin to update on a seller */
export interface AdminUpdateSellerPayload {
  name?: string;
  logo?: string;
  type?: string;
  official?: boolean;
  status?: string;
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
      .populate('seller', 'name type official')
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

  async getUserDetails(userId: string): Promise<{ user: IUser; seller: ISeller | null }> {
    const user = await User.findById(userId)
      .select('-password -refreshToken -verifyCode -passwordResetToken')
      .lean();
    if (!user) {
      throw new AppError('User not found', 404);
    }
    const seller = await Seller.findOne({ user: userId }).lean();
    return {
      user: user as IUser,
      seller: seller ? (seller as ISeller) : null,
    };
  }

  async updateUserDetails(userId: string, payload: AdminUpdateUserPayload): Promise<IUser> {
    const user = await this.verifyDoc(userId, User);
    const allowed = ['firstName', 'lastName', 'email', 'phoneNumber', 'nationality', 'currentLocation', 'profileImageUrl', 'role', 'verified'];
    const userRecord = user as unknown as Record<string, unknown>;
    for (const key of allowed) {
      const value = (payload as Record<string, unknown>)[key];
      if (value !== undefined) {
        userRecord[key] = value;
      }
    }
    await user.save();
    return user;
  }

  async updateSellerByUserId(userId: string, payload: AdminUpdateSellerPayload): Promise<ISeller> {
    const seller = await Seller.findOne({ user: userId });
    if (!seller) {
      throw new AppError('Seller profile not found for this user', 404);
    }
    const allowed = ['name', 'logo', 'type', 'official', 'status'];
    const sellerRecord = seller as unknown as Record<string, unknown>;
    for (const key of allowed) {
      const value = (payload as Record<string, unknown>)[key];
      if (value !== undefined) {
        sellerRecord[key] = value;
      }
    }
    await seller.save();
    return seller;
  }

  async resetUserPassword(userId: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.trim().length < 6) {
      throw new AppError('Password must be at least 6 characters', 400);
    }
    const user = await User.findById(userId).select('+password');
    if (!user) {
      throw new AppError('User not found', 404);
    }
    const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);
    (user as any).password = hashedPassword;
    await user.save();
  }

  // Category Management Methods
  async getAllCategories(): Promise<ICategory[]> {
    return Category.find()
      .populate('parent', 'name')
      .sort({ parent: 1, displayOrder: 1, createdAt: -1 });
  }

  async createCategory(data: { name: string; description?: string; parent?: string | null; isActive?: boolean; imageUrl?: string }): Promise<ICategory> {
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
      description: data.description?.trim(),
      parent: data.parent ? data.parent as any : null,
      isActive: data.isActive !== undefined ? data.isActive : true,
      imageUrl: data.imageUrl?.trim(),
    });

    await category.save();
    return category;
  }

  async updateCategory(categoryId: string, data: { name?: string; description?: string; parent?: string | null; isActive?: boolean; imageUrl?: string }): Promise<ICategory> {
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
      category.imageUrl = data.imageUrl?.trim();
    }

    await category.save();
    return category;
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
    return Brand.find().sort({ createdAt: -1 });
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
    return brand;
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
    return brand;
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

  async createProduct(data: any): Promise<IProduct> {
    // For admin-created products, we need to find or create a system seller
    let systemSeller = await Seller.findOne({ name: 'System Admin Store', type: 'company' });
    
    if (!systemSeller) {
      // Create a system seller if it doesn't exist
      // Note: This requires a user account, so we'll create a minimal seller entry
      // In a real implementation, you might want to create a dedicated admin user first
      systemSeller = new Seller({
        user: data.adminUserId || null, // You might need to pass admin user ID
        type: 'company',
        name: 'System Admin Store',
        logo: '',
        official: true,
        status: 'active',
        products: []
      });
      await systemSeller.save();
    }
    
    const product = new Product({
      name: data.name,
      description: data.description,
      productType: data.productType,
      category: data.category,
      brand: data.brand,
      price: data.price,
      originalPrice: data.originalPrice,
      condition: data.condition,
      color: data.color,
      quantityAvailable: data.quantityAvailable,
      images: data.images,
      isActive: data.isActive,
      isFlash: data.isFlash,
      isRecommended: data.isRecommended,
      rating: 0,
      noOfReviews: 0,
      reviews: [],
      owner: systemSeller._id, // Use the system seller as owner
    });

    await product.save();
    
    // Add product to seller's products list
    systemSeller.products.push(product._id as any);
    await systemSeller.save();
    
    return product;
  }

  async updateProductStatus(productId: string, isActive: boolean): Promise<IProduct> {
    const product = await Product.findByIdAndUpdate(
      productId,
      { isActive },
      { new: true, runValidators: true }
    );
    
    if (!product) {
      throw new AppError('Product not found', 404);
    }
    
    return product;
  }

  async updateProductFeatured(productId: string, data: { isRecommended?: boolean; isFlash?: boolean }): Promise<IProduct> {
    const updateData: any = {};
    
    if (data.isRecommended !== undefined) {
      updateData.isRecommended = data.isRecommended;
    }
    
    if (data.isFlash !== undefined) {
      updateData.isFlash = data.isFlash;
    }
    
    const product = await Product.findByIdAndUpdate(
      productId,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!product) {
      throw new AppError('Product not found', 404);
    }
    
    return product;
  }

  async deleteProduct(productId: string): Promise<void> {
    await this.verifyDoc(productId, Product);
    await Product.findByIdAndDelete(productId);
  }

  // Order Management Methods
  async getAllOrders(filters: any, page: number, limit: number): Promise<{ orders: IOrder[]; total: number; totalPages: number; currentPage: number }> {
    try {
      const skip = (page - 1) * limit;

      const orders = await Order.find(filters)
        .populate('user', 'firstName lastName email')
        .populate({
          path: 'items.product',
          select: 'name price images owner',
          options: { strictPopulate: false },
          populate: {
            path: 'owner',
            model: 'Seller',
            select: 'name logo user',
            options: { strictPopulate: false },
            populate: {
              path: 'user',
              model: 'User',
              select: 'firstName lastName',
              options: { strictPopulate: false },
            },
          },
        })
        .populate({
          path: 'payments',
          select: 'transactionId paymentMethod status amount providerTransactionId createdAt',
          options: { strictPopulate: false }
        })
        .populate({
          path: 'activePayment',
          select: 'transactionId paymentMethod status amount providerTransactionId createdAt',
          options: { strictPopulate: false }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      let ordersWithSellerInfo = (orders as any[]).map((order) => {
        const firstItem = order.items && order.items[0];
        const product = firstItem?.product;
        const owner = product?.owner;
        const sellerId = owner?._id?.toString?.() ?? owner?.id ?? (typeof owner === 'string' ? owner : null);
        const ownerUser = owner?.user;
        const sellerName = ownerUser
          ? [ownerUser.firstName, ownerUser.lastName].filter(Boolean).join(' ').trim() || null
          : null;
        const shopName = owner?.name ?? null;
        const sellerLogo = owner?.logo ?? null;
        return {
          ...order,
          ...(sellerId && { seller_id: sellerId }),
          ...(sellerName && { seller_name: sellerName }),
          ...(shopName && { shop_name: shopName }),
          ...(sellerLogo && { shop_logo: sellerLogo }),
        };
      });

      // Fallback: if any order has no seller name (populate may have failed or owner not in select), fetch Seller with user by product owner
      const ordersMissingSeller = ordersWithSellerInfo.filter((o: any) => !o.seller_name && !o.shop_name && o.items?.[0]?.product?._id);
      if (ordersMissingSeller.length > 0) {
        const productIds = ordersMissingSeller.map((o: any) => o.items[0].product._id);
        const productsWithOwner = await Product.find({ _id: { $in: productIds } })
          .select('owner')
          .populate({
            path: 'owner',
            model: Seller,
            select: 'name logo user',
            options: { strictPopulate: false },
            populate: { path: 'user', model: User, select: 'firstName lastName', options: { strictPopulate: false } },
          })
          .lean();
        const productToSeller = new Map<string, { id: string; sellerName: string; shopName: string; logo: string | null }>();
        for (const p of productsWithOwner as any[]) {
          const owner = p?.owner;
          if (!owner) continue;
          const id = owner._id?.toString?.() ?? owner.id ?? (typeof owner === 'string' ? owner : null);
          const ownerUser = owner?.user;
          const sellerName = ownerUser
            ? [ownerUser.firstName, ownerUser.lastName].filter(Boolean).join(' ').trim() || ''
            : '';
          const shopName = owner?.name ?? '';
          const logo = owner?.logo ?? null;
          if (id) productToSeller.set(p._id.toString(), { id, sellerName, shopName, logo: logo || null });
        }
        ordersWithSellerInfo = ordersWithSellerInfo.map((o: any) => {
          if (o.seller_name || o.shop_name) return o;
          const firstProductId = o.items?.[0]?.product?._id?.toString?.();
          const seller = firstProductId ? productToSeller.get(firstProductId) : null;
          if (!seller) return o;
          return {
            ...o,
            seller_id: seller.id,
            ...(seller.sellerName && { seller_name: seller.sellerName }),
            ...(seller.shopName && { shop_name: seller.shopName }),
            ...(seller.logo && { shop_logo: seller.logo }),
          };
        });
      }

      const ordersWithUsers = ordersWithSellerInfo.filter(order => {
        if (!order.user) {
          console.log(`⚠️ [AdminService] Filtering out order ${order._id || order.orderNumber} - user is deleted`);
          return false;
        }
        return true;
      });

      const totalWithUsers = await Order.countDocuments({
        ...filters,
        user: { $exists: true, $ne: null }
      });
      const totalPages = Math.ceil(totalWithUsers / limit);

      return {
        orders: ordersWithUsers as IOrder[],
        total: totalWithUsers,
        totalPages,
        currentPage: page,
      };
    } catch (error: any) {
      console.error('Error in getAllOrders:', error);
      console.error('Error stack:', error.stack);
      console.error('Filters:', JSON.stringify(filters, null, 2));
      throw new AppError(error.message || 'Failed to fetch orders', 500);
    }
  }

  async getOrderStats(): Promise<{ total: number; pending: number; confirmed: number; outForDelivery: number; complete: number; cancelled: number }> {
    const [
      total,
      pending,
      confirmed,
      outForDelivery,
      complete,
      cancelled
    ] = await Promise.all([
      Order.countDocuments().catch(() => 0),
      Order.countDocuments({ orderStatus: 'PENDING' }).catch(() => 0),
      Order.countDocuments({ orderStatus: 'CONFIRMED' }).catch(() => 0),
      Order.countDocuments({ orderStatus: 'OUT_FOR_DELIVERY' }).catch(() => 0),
      Order.countDocuments({ orderStatus: 'COMPLETE' }).catch(() => 0),
      Order.countDocuments({ orderStatus: 'CANCELLED' }).catch(() => 0)
    ]);
    return { total, pending, confirmed, outForDelivery, complete, cancelled };
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

  async getOrderDetails(orderId: string): Promise<IOrder> {
    try {
      const orderDoc = await Order.findById(orderId);
      if (!orderDoc) {
        throw new AppError('Order not found', 404);
      }

      // Now populate with proper error handling
      const order = await Order.findById(orderId)
        .populate({
          path: 'user',
          select: 'firstName lastName email phoneNumber',
          options: { strictPopulate: false }
        })
        .populate({
          path: 'items.product',
          select: 'name price images brand description owner',
          options: { strictPopulate: false },
          populate: {
            path: 'owner',
            model: 'Seller',
            select: 'name logo user',
            options: { strictPopulate: false },
            populate: {
              path: 'user',
              model: 'User',
              select: 'firstName lastName',
              options: { strictPopulate: false },
            },
          },
        })
        .populate({
          path: 'payments',
          select: 'transactionId paymentMethod paymentType status amount currency providerTransactionId providerReference phoneNumber failureReason failureCode attemptedAt processedAt completedAt failedAt createdAt updatedAt',
          options: { strictPopulate: false }
        })
        .populate({
          path: 'activePayment',
          select: 'transactionId paymentMethod paymentType status amount currency providerTransactionId providerReference phoneNumber failureReason failureCode attemptedAt processedAt completedAt failedAt createdAt updatedAt',
          options: { strictPopulate: false }
        })
        .lean(); // Use lean() to get plain JavaScript object

      if (!order) {
        throw new AppError('Order not found', 404);
      }

      // Don't return order if user is deleted
      if (!order.user) {
        throw new AppError('Order not found or user deleted', 404);
      }

      // Ensure user is properly handled
      const orderData = order as any;
      
      // Handle case where user might be null/undefined or missing _id
      if (!orderData.user) {
        // If user is null/undefined, get the user ID from the original document
        const userId = orderDoc.user?.toString() || orderDoc.user;
        if (userId) {
          // Try to fetch user data
          try {
            const user = await User.findById(userId).select('firstName lastName email phoneNumber').lean();
            orderData.user = user || {
              _id: userId,
              id: userId,
              firstName: 'Unknown',
              lastName: 'User',
              email: 'unknown@example.com'
            };
          } catch (userError) {
            // If user fetch fails, create a placeholder
            orderData.user = {
              _id: userId,
              id: userId,
              firstName: 'Unknown',
              lastName: 'User',
              email: 'unknown@example.com'
            };
          }
        } else {
          // No user reference at all
          orderData.user = {
            _id: null,
            id: null,
            firstName: 'Unknown',
            lastName: 'User',
            email: 'unknown@example.com'
          };
        }
      } else if (orderData.user && typeof orderData.user === 'object') {
        // Ensure user has _id and id fields
        if (!orderData.user._id && !orderData.user.id) {
          const userId = orderDoc.user?.toString() || orderDoc.user;
          if (userId) {
            orderData.user._id = userId;
            orderData.user.id = userId;
          }
        } else if (orderData.user._id && !orderData.user.id) {
          orderData.user.id = orderData.user._id.toString();
        } else if (orderData.user.id && !orderData.user._id) {
          orderData.user._id = orderData.user.id;
        }
      }

      // Attach seller/shop info from first item's product owner (for admin UI)
      // seller_name = owner's (User) name; shop_name = Seller's business name
      const firstItem = orderData.items && orderData.items[0];
      const product = firstItem?.product;
      const owner = product?.owner;
      if (owner) {
        const sid = owner._id?.toString?.() ?? owner.id ?? (typeof owner === 'string' ? owner : null);
        const ownerUser = owner?.user;
        const sellerName = ownerUser
          ? [ownerUser.firstName, ownerUser.lastName].filter(Boolean).join(' ').trim() || null
          : null;
        const shopName = owner?.name ?? null;
        const slogo = owner?.logo ?? null;
        if (sid) orderData.seller_id = sid;
        if (sellerName) orderData.seller_name = sellerName;
        if (shopName) orderData.shop_name = shopName;
        if (slogo) orderData.shop_logo = slogo;
      }

      return orderData as IOrder;
    } catch (error: any) {
      console.error('Error in getOrderDetails:', error);
      console.error('Error stack:', error.stack);
      console.error('OrderId:', orderId);
      throw new AppError(error.message || 'Failed to fetch order details', 500);
    }
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

    // Add bidBan fields to user (using any type for flexibility)
    (user as any).bidBan = {
      isBanned: true,
      reason: reason,
      bannedAt: new Date(),
      expiresAt: expiresAt || null
    };

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

    // Remove bidBan or set it to inactive
    (user as any).bidBan = {
      isBanned: false,
      reason: null,
      bannedAt: null,
      expiresAt: null,
      unbannedAt: new Date()
    };

    await user.save();
    return user;
  }
}