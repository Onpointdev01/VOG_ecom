import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPost,
  httpPut,
  httpDelete,
  requestBody,
  requestParam,
  request,
  response,
  queryParam,
} from 'inversify-express-utils';
import { Response, Request } from 'express';
import TYPES from '../di';
import { AdminService, CreateAdminRequest } from '../services/AdminService';
import { IProductBidService, IBidMessageService } from '../services';
import { OrderService } from '../services/OrderService';
import { BaseController } from './BaseController';
import AppError from '../utils/errors/AppError';
import { Product } from '../models';

export interface SignInAdminDTO {
  email: string;
  password: string;
}

export interface UpdateAdminDTO {
  firstName?: string;
  lastName?: string;
  role?: 'SUPER_ADMIN' | 'ADMIN';
}

export interface ChangePasswordDTO {
  currentPassword: string;
  newPassword: string;
}

@controller('/api/v1/admin')
export class AdminController extends BaseController {
  constructor(
    @inject(TYPES.AdminService) private adminService: AdminService,
    @inject(TYPES.ProductBidService) private productBidService: IProductBidService,
    @inject(TYPES.BidMessageService) private bidMessageService: IBidMessageService,
    @inject(TYPES.OrderService) private orderService: OrderService
  ) {
    super();
  }

  /**
   * Fix complete orders payment status (admin utility)
   * POST /api/v1/admin/orders/fix-payment-status
   */
  @httpPost('/orders/fix-payment-status', TYPES.RequireAdmin)
  public async fixCompleteOrdersPaymentStatus(@response() res: Response) {
    try {
      const result = await this.orderService.fixCompleteOrdersPaymentStatus();
      return this.sendResponse(res, 200, `Fixed ${result.updated} orders`, result);
    } catch (error: any) {
      throw new AppError(error.message || 'Failed to fix orders', error.statusCode || 500);
    }
  }

  @httpPost('/signup')
  public async signUpAdmin(@response() res: Response, @requestBody() payload: CreateAdminRequest) {
    const { firstName, lastName, email, password, role } = payload;

    // Basic validation
    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password?.trim()) {
      throw new AppError('All fields are required', 400);
    }

    if (password.length < 6) {
      throw new AppError('Password must be at least 6 characters long', 400);
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError('Please provide a valid email address', 400);
    }

    const admin = await this.adminService.createAdmin({
      firstName,
      lastName,
      email,
      password,
      role: role || 'ADMIN',
    });

    return this.sendResponse(res, 201, 'Admin account created successfully', {
      id: admin.id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
    });
  }

  @httpPost('/signin')
  public async signInAdmin(@response() res: Response, @requestBody() payload: SignInAdminDTO) {
    const { email, password } = payload;

    if (!email?.trim() || !password?.trim()) {
      throw new AppError('Email and password are required', 400);
    }

    const { admin, token } = await this.adminService.signInAdmin(email, password);

    return this.sendResponse(res, 200, 'Admin signed in successfully', {
      admin: {
        id: admin.id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
        lastLogin: admin.lastLogin,
      },
      token,
    });
  }

  @httpGet('/profile', TYPES.RequireAdmin)
  public async getAdminProfile(@response() res: Response) {
    const adminId = res.locals.admin;
    const admin = await this.adminService.checkAdminStatus(adminId);
    
    if (!admin) {
      throw new AppError('Admin not found', 404);
    }

    return this.sendResponse(res, 200, 'Admin profile retrieved successfully', {
      id: admin.id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
      lastLogin: admin.lastLogin,
      createdAt: admin.createdAt,
    });
  }

  @httpGet('/all', TYPES.RequireAdmin)
  public async getAllAdmins(@response() res: Response) {
    const admins = await this.adminService.getAllAdmins();
    return this.sendResponse(res, 200, 'Admins retrieved successfully', admins);
  }

  @httpPut('/profile', TYPES.RequireAdmin)
  public async updateAdminProfile(@response() res: Response, @requestBody() payload: UpdateAdminDTO) {
    const adminId = res.locals.admin;
    
    if (!payload.firstName && !payload.lastName && !payload.role) {
      throw new AppError('At least one field is required for update', 400);
    }

    const updatedAdmin = await this.adminService.updateAdmin(adminId, payload);
    
    return this.sendResponse(res, 200, 'Admin profile updated successfully', {
      id: updatedAdmin.id,
      firstName: updatedAdmin.firstName,
      lastName: updatedAdmin.lastName,
      email: updatedAdmin.email,
      role: updatedAdmin.role,
      isActive: updatedAdmin.isActive,
    });
  }

  @httpPut('/change-password', TYPES.RequireAdmin)
  public async changePassword(@response() res: Response, @requestBody() payload: ChangePasswordDTO) {
    const adminId = res.locals.admin;
    const { currentPassword, newPassword } = payload;

    if (!currentPassword?.trim() || !newPassword?.trim()) {
      throw new AppError('Current password and new password are required', 400);
    }

    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters long', 400);
    }

    await this.adminService.changeAdminPassword(adminId, currentPassword, newPassword);
    
    return this.sendResponse(res, 200, 'Password changed successfully', null);
  }

  @httpPut('/:adminId/status', TYPES.RequireAdmin)
  public async updateAdminStatus(@response() res: Response, @requestParam('adminId') adminId: string, @requestBody() payload: { isActive: boolean }) {
    if (typeof payload.isActive !== 'boolean') {
      throw new AppError('isActive field is required and must be boolean', 400);
    }

    const updatedAdmin = await this.adminService.updateAdminStatus(adminId, payload.isActive);
    
    return this.sendResponse(res, 200, 'Admin status updated successfully', {
      id: updatedAdmin.id,
      firstName: updatedAdmin.firstName,
      lastName: updatedAdmin.lastName,
      email: updatedAdmin.email,
      isActive: updatedAdmin.isActive,
    });
  }

  @httpDelete('/:adminId', TYPES.RequireAdmin)
  public async deleteAdmin(@response() res: Response, @requestParam('adminId') adminId: string) {
    const currentAdminId = res.locals.admin;
    
    // Prevent admin from deleting themselves
    if (adminId === currentAdminId) {
      throw new AppError('You cannot delete your own account', 400);
    }

    await this.adminService.deleteAdmin(adminId);
    
    return this.sendResponse(res, 200, 'Admin deleted successfully', null);
  }

  // Super admin only endpoints
  @httpPut('/:adminId/reset-password', TYPES.RequireAdmin)
  public async resetAdminPassword(@response() res: Response, @requestParam('adminId') adminId: string, @requestBody() payload: { newPassword: string }) {
    const { newPassword } = payload;

    if (!newPassword?.trim()) {
      throw new AppError('New password is required', 400);
    }

    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters long', 400);
    }

    await this.adminService.resetAdminPassword(adminId, newPassword);
    
    return this.sendResponse(res, 200, 'Admin password reset successfully', null);
  }

  // User Management Endpoints
  @httpGet('/users', TYPES.RequireAdmin)
  public async getAllUsers(
    @response() res: Response,
    @queryParam('page') page: string = '1',
    @queryParam('limit') limit: string = '10',
    @queryParam('search') search?: string,
    @queryParam('banned') banned?: string,
    @queryParam('verified') verified?: string,
    @queryParam('role') role?: string
  ) {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit) || 10));
    
    const filters: any = {};
    
    if (search) {
      filters.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (banned !== undefined) {
      filters.banned = banned === 'true';
    }
    
    if (verified !== undefined) {
      filters.verified = verified === 'true';
    }
    
    if (role) {
      filters.role = role;
    }

    const users = await this.adminService.getAllUsers(filters, pageNumber, limitNumber);

    return this.sendResponse(res, 200, 'Users retrieved successfully', users);
  }

  @httpGet('/users/:userId', TYPES.RequireAdmin)
  public async getUserDetails(
    @response() res: Response,
    @requestParam('userId') userId: string
  ) {
    const result = await this.adminService.getUserDetails(userId);
    return this.sendResponse(res, 200, 'User details retrieved successfully', result);
  }

  @httpPut('/users/:userId/reset-password', TYPES.RequireAdmin)
  public async resetUserPassword(
    @response() res: Response,
    @requestParam('userId') userId: string,
    @requestBody() payload: { newPassword: string }
  ) {
    const { newPassword } = payload;
    if (!newPassword || typeof newPassword !== 'string') {
      throw new AppError('newPassword is required', 400);
    }
    await this.adminService.resetUserPassword(userId, newPassword);
    return this.sendResponse(res, 200, 'User password reset successfully', null);
  }

  @httpPut('/users/:userId', TYPES.RequireAdmin)
  public async updateUserDetails(
    @response() res: Response,
    @requestParam('userId') userId: string,
    @requestBody() payload: any
  ) {
    const user = await this.adminService.updateUserDetails(userId, payload);
    return this.sendResponse(res, 200, 'User updated successfully', user);
  }

  @httpPut('/users/:userId/seller', TYPES.RequireAdmin)
  public async updateUserSeller(
    @response() res: Response,
    @requestParam('userId') userId: string,
    @requestBody() payload: any
  ) {
    const seller = await this.adminService.updateSellerByUserId(userId, payload);
    return this.sendResponse(res, 200, 'Seller profile updated successfully', seller);
  }

  @httpPut('/users/:userId/ban', TYPES.RequireAdmin)
  public async banUser(
    @response() res: Response, 
    @requestParam('userId') userId: string, 
    @requestBody() payload: { banned: boolean; banReason?: string; banExpires?: Date }
  ) {
    const { banned, banReason, banExpires } = payload;

    if (typeof banned !== 'boolean') {
      throw new AppError('banned field is required and must be boolean', 400);
    }

    if (banned && !banReason?.trim()) {
      throw new AppError('Ban reason is required when banning a user', 400);
    }

    const user = await this.adminService.updateUserBanStatus(userId, banned, banReason, banExpires);
    
    return this.sendResponse(res, 200, `User ${banned ? 'banned' : 'unbanned'} successfully`, {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
    });
  }

  // Category Management Endpoints
  @httpGet('/categories', TYPES.RequireAdmin)
  public async getAllCategories(@response() res: Response) {
    const categories = await this.adminService.getAllCategories();
    return this.sendResponse(res, 200, 'Categories retrieved successfully', categories);
  }

  @httpPost('/categories', TYPES.RequireAdmin)
  public async createCategory(
    @response() res: Response,
    @requestBody() payload: { name: string; description?: string; parent?: string | null; isActive?: boolean; imageUrl?: string }
  ) {
    const { name, description, parent, isActive, imageUrl } = payload;

    if (!name?.trim()) {
      throw new AppError('Category name is required', 400);
    }

    const category = await this.adminService.createCategory({ name, description, parent, isActive, imageUrl });
    return this.sendResponse(res, 201, 'Category created successfully', category);
  }

  @httpPut('/categories/:categoryId', TYPES.RequireAdmin)
  public async updateCategory(
    @response() res: Response,
    @requestParam('categoryId') categoryId: string,
    @requestBody() payload: { name?: string; description?: string; parent?: string | null; isActive?: boolean; imageUrl?: string }
  ) {
    const { name, description, parent, isActive, imageUrl } = payload;

    if (!name && description === undefined && parent === undefined && isActive === undefined && imageUrl === undefined) {
      throw new AppError('At least one field is required for update', 400);
    }

    const category = await this.adminService.updateCategory(categoryId, { name, description, parent, isActive, imageUrl });
    return this.sendResponse(res, 200, 'Category updated successfully', category);
  }

  @httpDelete('/categories/:categoryId', TYPES.RequireAdmin)
  public async deleteCategory(@response() res: Response, @requestParam('categoryId') categoryId: string) {
    await this.adminService.deleteCategory(categoryId);
    return this.sendResponse(res, 200, 'Category deleted successfully', null);
  }

  // Brand Management Endpoints
  @httpGet('/brands', TYPES.RequireAdmin)
  public async getAllBrands(@response() res: Response) {
    const brands = await this.adminService.getAllBrands();
    return this.sendResponse(res, 200, 'Brands retrieved successfully', brands);
  }

  @httpPost('/brands', TYPES.RequireAdmin)
  public async createBrand(
    @response() res: Response,
    @requestBody() payload: { name: string; description?: string; logoUrl?: string; website?: string; isActive?: boolean }
  ) {
    const { name, description, logoUrl, website, isActive } = payload;

    if (!name?.trim()) {
      throw new AppError('Brand name is required', 400);
    }

    const brand = await this.adminService.createBrand({ name, description, logoUrl, website, isActive });
    return this.sendResponse(res, 201, 'Brand created successfully', brand);
  }

  @httpPut('/brands/:brandId', TYPES.RequireAdmin)
  public async updateBrand(
    @response() res: Response,
    @requestParam('brandId') brandId: string,
    @requestBody() payload: { name?: string; description?: string; logoUrl?: string; website?: string; isActive?: boolean }
  ) {
    const { name, description, logoUrl, website, isActive } = payload;

    if (!name && description === undefined && logoUrl === undefined && website === undefined && isActive === undefined) {
      throw new AppError('At least one field is required for update', 400);
    }

    const brand = await this.adminService.updateBrand(brandId, { name, description, logoUrl, website, isActive });
    return this.sendResponse(res, 200, 'Brand updated successfully', brand);
  }

  @httpDelete('/brands/:brandId', TYPES.RequireAdmin)
  public async deleteBrand(@response() res: Response, @requestParam('brandId') brandId: string) {
    await this.adminService.deleteBrand(brandId);
    return this.sendResponse(res, 200, 'Brand deleted successfully', null);
  }

  // Product Management Endpoints
  @httpGet('/products', TYPES.RequireAdmin)
  public async getAllProducts(
    @response() res: Response,
    @queryParam('page') page: string = '1',
    @queryParam('limit') limit: string = '10',
    @queryParam('search') search?: string,
    @queryParam('isActive') isActive?: string,
    @queryParam('category') category?: string,
    @queryParam('owner') owner?: string
  ) {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit) || 10));
    
    const filters: any = {};
    
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    
    if (category) {
      filters.category = category;
    }
    
    if (owner) {
      filters.owner = owner;
    }

    const products = await this.adminService.getAllProducts(filters, pageNumber, limitNumber);
    
    return this.sendResponse(res, 200, 'Products retrieved successfully', products);
  }

  @httpPut('/products/:productId/status', TYPES.RequireAdmin)
  public async updateProductStatus(
    @response() res: Response,
    @requestParam('productId') productId: string,
    @requestBody() payload: { isActive: boolean }
  ) {
    const { isActive } = payload;

    if (typeof isActive !== 'boolean') {
      throw new AppError('isActive field is required and must be boolean', 400);
    }

    const product = await this.adminService.updateProductStatus(productId, isActive);
    
    return this.sendResponse(res, 200, 'Product status updated successfully', product);
  }

  @httpPut('/products/:productId/featured', TYPES.RequireAdmin)
  public async updateProductFeatured(
    @response() res: Response,
    @requestParam('productId') productId: string,
    @requestBody() payload: { isRecommended?: boolean; isFlash?: boolean }
  ) {
    const { isRecommended, isFlash } = payload;

    const product = await this.adminService.updateProductFeatured(productId, { isRecommended, isFlash });
    
    return this.sendResponse(res, 200, 'Product featured status updated successfully', product);
  }

  @httpPost('/products', TYPES.RequireAdmin)
  public async createProduct(@response() res: Response, @requestBody() payload: any) {
    const {
      name,
      description,
      brand,
      category,
      productType,
      price,
      originalPrice,
      condition,
      color,
      quantityAvailable,
      images,
      isActive,
      isRecommended,
      isFlash
    } = payload;

    // Basic validation
    if (!name?.trim() || !description?.trim() || !brand || !category) {
      throw new AppError('Name, description, brand, and category are required', 400);
    }

    const adminId = res.locals.admin;
    
    const product = await this.adminService.createProduct({
      name: name.trim(),
      description: description.trim(),
      brand,
      category,
      productType: productType || 'simple',
      price,
      originalPrice,
      condition,
      color,
      quantityAvailable,
      images: images || [],
      isActive: isActive !== undefined ? isActive : true,
      isRecommended: isRecommended || false,
      isFlash: isFlash || false,
      adminUserId: adminId,
    });

    return this.sendResponse(res, 201, 'Product created successfully', product);
  }

  @httpDelete('/products/:productId', TYPES.RequireAdmin)
  public async deleteProduct(@response() res: Response, @requestParam('productId') productId: string) {
    await this.adminService.deleteProduct(productId);
    return this.sendResponse(res, 200, 'Product deleted successfully', null);
  }

  // Order Management Endpoints
  @httpGet('/orders/stats', TYPES.RequireAdmin)
  public async getOrderStats(@response() res: Response) {
    const stats = await this.adminService.getOrderStats();
    return this.sendResponse(res, 200, 'Order statistics retrieved successfully', stats);
  }

  @httpGet('/orders', TYPES.RequireAdmin)
  public async getAllOrders(
    @response() res: Response,
    @queryParam('page') page: string = '1',
    @queryParam('limit') limit: string = '10',
    @queryParam('status') status?: string,
    @queryParam('paymentStatus') paymentStatus?: string,
    @queryParam('currency') currency?: string,
    @queryParam('search') search?: string,
    @queryParam('dateFrom') dateFrom?: string,
    @queryParam('dateTo') dateTo?: string
  ) {
    try {
      const pageNumber = Math.max(1, parseInt(page) || 1);
      const limitNumber = Math.min(100, Math.max(1, parseInt(limit) || 10));
      
      const filters: any = {};
      
      if (status) {
        filters.orderStatus = status;
      }
      
      if (paymentStatus) {
        filters.paymentStatus = paymentStatus;
      }
      
      if (currency) {
        filters.currency = currency;
      }
      
      if (search) {
        filters.$or = [
          { orderNumber: { $regex: search, $options: 'i' } },
          { 'shippingAddress.fullName': { $regex: search, $options: 'i' } },
          { 'shippingAddress.phoneNumber': { $regex: search, $options: 'i' } }
        ];
      }
      
      if (dateFrom || dateTo) {
        filters.createdAt = {};
        if (dateFrom) filters.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filters.createdAt.$lte = new Date(dateTo);
      }

      const orders = await this.adminService.getAllOrders(filters, pageNumber, limitNumber);
      
      return this.sendResponse(res, 200, 'Orders retrieved successfully', orders);
    } catch (error: any) {
      console.error('Error in getAllOrders controller:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw error; // Re-throw to let error handler process it
    }
  }

  @httpPut('/orders/:orderId/status', TYPES.RequireAdmin)
  public async updateOrderStatus(
    @response() res: Response,
    @request() req: Request,
    @requestParam('orderId') orderId: string,
    @requestBody() payload: { orderStatus: string }
  ) {
    const { orderStatus } = payload;
    const admin = (req as any).admin;

    // Use OrderService instead of AdminService to ensure notifications are sent
    // OrderService handles cart clearing and push notifications
    // Pass adminId to exclude this admin from receiving notifications
    const order = await this.orderService.updateOrderStatus(
      orderId, 
      orderStatus,
      { adminId: admin?._id?.toString() || admin?.id }
    );

    return this.sendResponse(res, 200, 'Order status updated successfully', order);
  }

  @httpPut('/orders/:orderId/payment-status', TYPES.RequireAdmin)
  public async updateOrderPaymentStatus(
    @response() res: Response,
    @requestParam('orderId') orderId: string,
    @requestBody() payload: { paymentStatus: string }
  ) {
    const { paymentStatus } = payload;

    const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED'];
    if (!validStatuses.includes(paymentStatus)) {
      throw new AppError('Invalid payment status', 400);
    }

    const order = await this.adminService.updateOrderPaymentStatus(orderId, paymentStatus);
    
    return this.sendResponse(res, 200, 'Order payment status updated successfully', order);
  }

  @httpGet('/orders/:orderId', TYPES.RequireAdmin)
  public async getOrderDetails(@response() res: Response, @requestParam('orderId') orderId: string) {
    try {
      if (!orderId || orderId === 'undefined') {
        return this.sendResponse(res, 400, 'Order ID is required');
      }
      const order = await this.adminService.getOrderDetails(orderId);
      return this.sendResponse(res, 200, 'Order details retrieved successfully', order);
    } catch (error: any) {
      console.error('Error in getOrderDetails controller:', error);
      throw error;
    }
  }

  // =====================================
  // BID MANAGEMENT ENDPOINTS
  // =====================================

  @httpGet('/bids', TYPES.RequireAdmin)
  public async getAllBids(
    @response() res: Response,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('status') status?: string,
    @queryParam('search') search?: string,
    @queryParam('dateFrom') dateFrom?: string,
    @queryParam('dateTo') dateTo?: string,
    @queryParam('productId') productId?: string,
    @queryParam('buyerId') buyerId?: string,
    @queryParam('sellerId') sellerId?: string
  ) {
    const pageNumber = parseInt(page || '1');
    const limitNumber = parseInt(limit || '20');

    const filters: any = {};

    if (status) {
      filters.status = status;
    }

    if (productId) {
      filters.product = productId;
    }

    if (buyerId) {
      filters.buyer = buyerId;
    }

    if (sellerId) {
      filters.seller = sellerId;
    }

    if (dateFrom || dateTo) {
      filters.createdAt = {};
      if (dateFrom) filters.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filters.createdAt.$lte = new Date(dateTo);
    }

    const bids = await this.productBidService.getAllBidsForAdmin(filters, pageNumber, limitNumber, search);
    
    return this.sendResponse(res, 200, 'Bids retrieved successfully', bids);
  }

  @httpGet('/bids/statistics', TYPES.RequireAdmin)
  public async getBidStatistics(@response() res: Response) {
    const stats = await this.productBidService.getBidStatistics();
    return this.sendResponse(res, 200, 'Bid statistics retrieved successfully', stats);
  }

  @httpGet('/bids/:bidId', TYPES.RequireAdmin)
  public async getBidDetails(@response() res: Response, @requestParam('bidId') bidId: string) {
    const bid = await this.productBidService.getBidById(bidId);
    
    if (!bid) {
      throw new AppError('Bid not found', 404);
    }
    
    return this.sendResponse(res, 200, 'Bid details retrieved successfully', bid);
  }

  @httpPut('/bids/:bidId/accept', TYPES.RequireAdmin)
  public async acceptBid(
    @response() res: Response,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { reason?: string }
  ) {
    const { reason } = payload || {};
    
    const bid = await this.productBidService.forceAcceptBid(bidId, reason);
    
    // Create BID_ACCEPTED message in chat
    if (bid.buyer && bid.product) {
      try {
        const buyerId = typeof bid.buyer === 'object' && (bid.buyer as any)._id 
          ? (bid.buyer as any)._id.toString() 
          : bid.buyer.toString();
        
        const productId = typeof bid.product === 'object' && (bid.product as any)._id 
          ? (bid.product as any)._id.toString() 
          : bid.product.toString();
        
        // Get product owner (seller) - need to fetch product to get owner
        const product = await Product.findById(productId).populate('owner', '_id');
        const sellerUserId = product?.owner?._id?.toString() || product?.owner?.toString() || res.locals.admin;
        
        const productName = typeof bid.product === 'object' && (bid.product as any).name
          ? (bid.product as any).name
          : 'Product';
        
        const message = reason 
          ? `Your bid of $${bid.bidPrice} has been accepted! Reason: ${reason}`
          : `Your bid of $${bid.bidPrice} has been accepted!`;
        
        // IMPORTANT: sender = seller/admin (who accepts), recipient = buyer (who receives the acceptance)
        // Use seller's user ID if available, otherwise use admin ID
        await this.bidMessageService.createBidAcceptedMessage(
          sellerUserId, // sender: seller's user ID or admin ID
          buyerId, // recipient: buyer
          productId,
          bidId,
          message
        );
        
        console.log(`✅ Created BID_ACCEPTED message for bid ${bidId}: sender=${sellerUserId}, recipient=${buyerId}, productId=${productId}`);
      } catch (error) {
        console.error('❌ Failed to create bid accepted message:', error);
        // Don't fail the request if message creation fails
      }
    }
    
    // Generate add-to-cart link for the buyer
    const addToCartLink = `/api/v1/bids/${bidId}/add-to-cart`;
    
    return this.sendResponse(res, 200, 'Bid accepted successfully', {
      bid: bid,
      addToCartLink,
      expiresAt: bid.expiresAt
    });
  }

  @httpPut('/bids/:bidId/force-accept', TYPES.RequireAdmin)
  public async forceAcceptBid(
    @response() res: Response,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { reason?: string }
  ) {
    try {
      const { reason } = payload || {};
      
      const bid = await this.productBidService.forceAcceptBid(bidId, reason);
      
      // Send notification to buyer - same as seller acceptance
      if (bid.seller && bid.buyer) {
        try {
          const message = reason 
            ? `Your bid of $${bid.bidPrice} has been accepted by admin! Reason: ${reason}`
            : `Your bid of $${bid.bidPrice} has been accepted by admin!`;
          
          await this.bidMessageService.createBidAcceptedMessage(
            bid.seller.toString(),
            bid.buyer.toString(),
            bid.product.toString(),
            bidId,
            message
          );
        } catch (messageError) {
          // Log error but don't fail the bid acceptance
          console.error('Failed to create bid accepted message:', messageError);
        }
      }
      
      // Generate add-to-cart link for the buyer (same as seller acceptance)
      const addToCartLink = `/api/v1/bids/${bidId}/add-to-cart`;
      
      return this.sendResponse(res, 200, 'Bid force accepted successfully', {
        bid: bid,
        addToCartLink,
        expiresAt: bid.expiresAt
      });
    } catch (error: any) {
      console.error('Error in forceAcceptBid:', error);
      throw error;
    }
  }

  @httpPut('/bids/:bidId/reject', TYPES.RequireAdmin)
  public async rejectBid(
    @response() res: Response,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { reason?: string; messageId?: string }
  ) {
    const { reason, messageId } = payload || {};
    
    const bid = await this.productBidService.forceRejectBid(bidId, reason);
    
    // Create BID_REJECTED message in chat
    if (bid.buyer && bid.product) {
      try {
        const buyerId = typeof bid.buyer === 'object' && (bid.buyer as any)._id 
          ? (bid.buyer as any)._id.toString() 
          : bid.buyer.toString();
        
        const productId = typeof bid.product === 'object' && (bid.product as any)._id 
          ? (bid.product as any)._id.toString() 
          : bid.product.toString();
        
        // Get product owner (seller) - need to fetch product to get owner
        const product = await Product.findById(productId).populate('owner', '_id');
        const sellerUserId = product?.owner?._id?.toString() || product?.owner?.toString() || res.locals.admin;
        
        const productName = typeof bid.product === 'object' && (bid.product as any).name
          ? (bid.product as any).name
          : 'Product';
        
        // Always include reason in message if provided
        const message = reason && reason.trim()
          ? `Your offer has been declined. Reason: ${reason}`
          : `Your offer has been declined.`;
        
        // IMPORTANT: sender = seller/admin (who rejects), recipient = buyer (who receives the rejection)
        await this.bidMessageService.createBidRejectedMessage(
          sellerUserId, // sender: seller's user ID or admin ID
          buyerId, // recipient: buyer
          productId,
          bidId,
          message
        );
        
        console.log(`✅ Created BID_REJECTED message for bid ${bidId}: sender=${sellerUserId}, recipient=${buyerId}, reason=${reason || 'none'}`);
      } catch (error) {
        console.error('❌ Failed to create bid rejected message:', error);
        // Don't fail the request if message creation fails
      }
    }
    
    return this.sendResponse(res, 200, 'Bid rejected successfully', {
      bid,
      messageId // Return messageId if provided for frontend update
    });
  }

  @httpPut('/bids/:bidId/force-reject', TYPES.RequireAdmin)
  public async forceRejectBid(
    @response() res: Response,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { reason?: string }
  ) {
    // Alias to rejectBid for backward compatibility
    return this.rejectBid(res, bidId, payload);
  }

  @httpPut('/bids/:bidId/cancel', TYPES.RequireAdmin)
  public async cancelBid(
    @response() res: Response,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { reason: string }
  ) {
    const { reason } = payload;
    
    if (!reason?.trim()) {
      throw new AppError('Reason is required for bid cancellation', 400);
    }
    
    const bid = await this.productBidService.cancelBid(bidId, reason);
    
    // Create SYSTEM message in chat for both buyer and seller
    if (bid.buyer && bid.product) {
      try {
        const buyerId = typeof bid.buyer === 'object' && (bid.buyer as any)._id 
          ? (bid.buyer as any)._id.toString() 
          : bid.buyer.toString();
        
        const productId = typeof bid.product === 'object' && (bid.product as any)._id 
          ? (bid.product as any)._id.toString() 
          : bid.product.toString();
        
        // Get product owner (seller) - need to fetch product to get owner
        const product = await Product.findById(productId).populate('owner', '_id');
        const sellerUserId = product?.owner?._id?.toString() || product?.owner?.toString() || res.locals.admin;
        
        // Create message for buyer (admin -> buyer)
        await this.bidMessageService.createSystemMessage(
          res.locals.admin, // sender: admin
          buyerId, // recipient: buyer
          productId,
          bidId,
          `This bid has been cancelled by admin. Reason: ${reason}`
        );
        
        // Also create message for seller (admin -> seller) if seller is different from admin
        if (sellerUserId !== res.locals.admin) {
          await this.bidMessageService.createSystemMessage(
            res.locals.admin, // sender: admin
            sellerUserId, // recipient: seller
            productId,
            bidId,
            `This bid has been cancelled by admin. Reason: ${reason}`
          );
        }
        
        console.log(`✅ Created CANCELLED messages for bid ${bidId}: reason=${reason}`);
      } catch (error) {
        console.error('❌ Failed to create bid cancelled message:', error);
        // Don't fail the request if message creation fails
      }
    }
    
    return this.sendResponse(res, 200, 'Bid cancelled successfully', bid);
  }

  @httpPost('/bids/:bidId/counter-offer', TYPES.RequireAdmin)
  public async createCounterOffer(
    @response() res: Response,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { counterPrice: number; reason?: string }
  ) {
    const { counterPrice, reason } = payload || {};
    
    if (!counterPrice || counterPrice <= 0) {
      return this.sendResponse(res, 400, 'Counter price is required and must be greater than 0');
    }
    
    const counterBid = await this.productBidService.createCounterOffer(bidId, counterPrice, reason);
    
    // Create counter offer message
    const originalBid = await this.productBidService.getBidById(bidId);
    if (originalBid && originalBid.buyer) {
      try {
        const buyerId = typeof originalBid.buyer === 'object' && (originalBid.buyer as any)._id 
          ? (originalBid.buyer as any)._id.toString() 
          : originalBid.buyer.toString();
        
        const message = reason 
          ? `We counter your offer with $${counterPrice.toFixed(2)}. Reason: ${reason}`
          : `We counter your offer with $${counterPrice.toFixed(2)}.`;
        
        await this.bidMessageService.createCounterOfferMessage(
          originalBid.seller?.toString() || '',
          buyerId,
          originalBid.product.toString(),
          bidId,
          counterBid._id.toString(),
          counterPrice,
          message
        );
      } catch (error) {
        console.error('Failed to create counter offer message:', error);
      }
    }
    
    return this.sendResponse(res, 200, 'Counter offer created successfully', {
      counterBid,
      originalBidId: bidId
    });
  }

  @httpGet('/bid-messages', TYPES.RequireAdmin)
  public async getAllBidMessages(
    @response() res: Response,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('productId') productId?: string,
    @queryParam('type') type?: string
  ) {
    const pageNumber = parseInt(page || '1');
    const limitNumber = parseInt(limit || '50');

    const messages = await this.bidMessageService.getAllMessagesForAdmin(
      { productId, type },
      pageNumber,
      limitNumber
    );
    
    return this.sendResponse(res, 200, 'Bid messages retrieved successfully', messages);
  }

  @httpPut('/users/:userId/bid-ban', TYPES.RequireAdmin)
  public async banUserFromBidding(
    @response() res: Response,
    @requestParam('userId') userId: string,
    @requestBody() payload: { reason: string; expiresAt?: string }
  ) {
    const { reason, expiresAt } = payload;
    
    if (!reason?.trim()) {
      throw new AppError('Reason is required for bid ban', 400);
    }
    
    const user = await this.adminService.banUserFromBidding(userId, reason, expiresAt ? new Date(expiresAt) : undefined);
    
    return this.sendResponse(res, 200, 'User banned from bidding successfully', user);
  }

  @httpPut('/users/:userId/bid-unban', TYPES.RequireAdmin)
  public async unbanUserFromBidding(
    @response() res: Response,
    @requestParam('userId') userId: string
  ) {
    const user = await this.adminService.unbanUserFromBidding(userId);
    
    return this.sendResponse(res, 200, 'User unbanned from bidding successfully', user);
  }

  @httpGet('/bid-analytics', TYPES.RequireAdmin)
  public async getBidAnalytics(
    @response() res: Response,
    @queryParam('period') period?: string, // 'daily', 'weekly', 'monthly'
    @queryParam('dateFrom') dateFrom?: string,
    @queryParam('dateTo') dateTo?: string
  ) {
    const analytics = await this.productBidService.getBidAnalytics(period || 'weekly', dateFrom, dateTo);
    
    return this.sendResponse(res, 200, 'Bid analytics retrieved successfully', analytics);
  }

  // =====================================
  // PRODUCT-CENTRIC BID MANAGEMENT ENDPOINTS
  // =====================================

  @httpGet('/products/with-bids', TYPES.RequireAdmin)
  public async getProductsWithBids(
    @response() res: Response,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('search') search?: string
  ) {
    const pageNumber = parseInt(page || '1');
    const limitNumber = parseInt(limit || '10');

    const products = await this.productBidService.getProductsWithBids(
      { search },
      pageNumber,
      limitNumber
    );
    
    return this.sendResponse(res, 200, 'Products with bids retrieved successfully', products);
  }

  @httpGet('/products/:productId/bids', TYPES.RequireAdmin)
  public async getProductBids(
    @response() res: Response,
    @requestParam('productId') productId: string
  ) {
    const productBids = await this.productBidService.getProductBidsForAdmin(productId);
    
    return this.sendResponse(res, 200, 'Product bids retrieved successfully', productBids);
  }

  @httpGet('/debug/bid-counts', TYPES.RequireAdmin)
  public async getDebugBidCounts(@response() res: Response) {
    const bidCounts = await this.productBidService.getDebugBidCounts();
    
    return this.sendResponse(res, 200, 'Debug bid counts retrieved successfully', bidCounts);
  }
}