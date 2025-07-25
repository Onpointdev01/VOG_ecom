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
  
  // Category Management
  getAllCategories(): Promise<ICategory[]>;
  createCategory(data: { name: string; description?: string; isActive?: boolean }): Promise<ICategory>;
  updateCategory(categoryId: string, data: { name?: string; description?: string; isActive?: boolean }): Promise<ICategory>;
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

  // Category Management Methods
  async getAllCategories(): Promise<ICategory[]> {
    return Category.find()
      .populate('parent', 'name')
      .sort({ parent: 1, displayOrder: 1, createdAt: -1 });
  }

  async createCategory(data: { name: string; description?: string; parent?: string | null; isActive?: boolean }): Promise<ICategory> {
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
    });

    await category.save();
    return category;
  }

  async updateCategory(categoryId: string, data: { name?: string; description?: string; parent?: string | null; isActive?: boolean }): Promise<ICategory> {
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
    
    const orders = await Order.find(filters)
      .populate('user', 'firstName lastName email')
      .populate('items.product', 'name price images')
      .populate('payments', 'transactionId paymentMethod status amount providerTransactionId createdAt')
      .populate('activePayment', 'transactionId paymentMethod status amount providerTransactionId createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Order.countDocuments(filters);
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

  async getOrderDetails(orderId: string): Promise<IOrder> {
    const order = await Order.findById(orderId)
      .populate('user', 'firstName lastName email phoneNumber')
      .populate('items.product', 'name price images brand description')
      .populate('payments', 'transactionId paymentMethod paymentType status amount currency providerTransactionId providerReference phoneNumber failureReason failureCode attemptedAt processedAt completedAt failedAt createdAt updatedAt')
      .populate('activePayment', 'transactionId paymentMethod paymentType status amount currency providerTransactionId providerReference phoneNumber failureReason failureCode attemptedAt processedAt completedAt failedAt createdAt updatedAt')
      .lean();

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