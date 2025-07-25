import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPost,
  httpPut,
  httpDelete,
  requestBody,
  requestParam,
  response,
  queryParam,
} from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import { AdminService, CreateAdminRequest } from '../services/AdminService';
import { IProductBidService, IBidMessageService } from '../services';
import { BaseController } from './BaseController';
import AppError from '../utils/errors/AppError';

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
    @inject(TYPES.BidMessageService) private bidMessageService: IBidMessageService
  ) {
    super();
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
    @requestBody() payload: { name: string; description?: string; parent?: string | null; isActive?: boolean }
  ) {
    const { name, description, parent, isActive } = payload;

    if (!name?.trim()) {
      throw new AppError('Category name is required', 400);
    }

    const category = await this.adminService.createCategory({ name, description, parent, isActive });
    return this.sendResponse(res, 201, 'Category created successfully', category);
  }

  @httpPut('/categories/:categoryId', TYPES.RequireAdmin)
  public async updateCategory(
    @response() res: Response,
    @requestParam('categoryId') categoryId: string,
    @requestBody() payload: { name?: string; description?: string; parent?: string | null; isActive?: boolean }
  ) {
    const { name, description, parent, isActive } = payload;

    if (!name && description === undefined && parent === undefined && isActive === undefined) {
      throw new AppError('At least one field is required for update', 400);
    }

    const category = await this.adminService.updateCategory(categoryId, { name, description, parent, isActive });
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
  @httpGet('/orders', TYPES.RequireAdmin)
  public async getAllOrders(
    @response() res: Response,
    @queryParam('page') page: string = '1',
    @queryParam('limit') limit: string = '10',
    @queryParam('status') status?: string,
    @queryParam('paymentStatus') paymentStatus?: string,
    @queryParam('search') search?: string,
    @queryParam('dateFrom') dateFrom?: string,
    @queryParam('dateTo') dateTo?: string
  ) {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit) || 10));
    
    const filters: any = {};
    
    if (status) {
      filters.orderStatus = status;
    }
    
    if (paymentStatus) {
      filters.paymentStatus = paymentStatus;
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
  }

  @httpPut('/orders/:orderId/status', TYPES.RequireAdmin)
  public async updateOrderStatus(
    @response() res: Response,
    @requestParam('orderId') orderId: string,
    @requestBody() payload: { orderStatus: string }
  ) {
    const { orderStatus } = payload;

    const validStatuses = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(orderStatus)) {
      throw new AppError('Invalid order status', 400);
    }

    const order = await this.adminService.updateOrderStatus(orderId, orderStatus);
    
    return this.sendResponse(res, 200, 'Order status updated successfully', order);
  }

  @httpPut('/orders/:orderId/payment-status', TYPES.RequireAdmin)
  public async updateOrderPaymentStatus(
    @response() res: Response,
    @requestParam('orderId') orderId: string,
    @requestBody() payload: { paymentStatus: string }
  ) {
    const { paymentStatus } = payload;

    const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];
    if (!validStatuses.includes(paymentStatus)) {
      throw new AppError('Invalid payment status', 400);
    }

    const order = await this.adminService.updateOrderPaymentStatus(orderId, paymentStatus);
    
    return this.sendResponse(res, 200, 'Order payment status updated successfully', order);
  }

  @httpGet('/orders/:orderId', TYPES.RequireAdmin)
  public async getOrderDetails(@response() res: Response, @requestParam('orderId') orderId: string) {
    const order = await this.adminService.getOrderDetails(orderId);
    return this.sendResponse(res, 200, 'Order details retrieved successfully', order);
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

  @httpPut('/bids/:bidId/force-accept', TYPES.RequireAdmin)
  public async forceAcceptBid(
    @response() res: Response,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { reason?: string }
  ) {
    const { reason } = payload;
    
    const bid = await this.productBidService.forceAcceptBid(bidId, reason);
    
    // Send notification to both buyer and seller
    if (bid.seller && bid.buyer) {
      await this.bidMessageService.createSystemMessage(
        bid.seller.toString(),
        bid.buyer.toString(),
        bid.product.toString(),
        bidId,
        `Your bid has been accepted by admin. ${reason ? `Reason: ${reason}` : ''}`
      );
    }
    
    return this.sendResponse(res, 200, 'Bid force accepted successfully', bid);
  }

  @httpPut('/bids/:bidId/force-reject', TYPES.RequireAdmin)
  public async forceRejectBid(
    @response() res: Response,
    @requestParam('bidId') bidId: string,
    @requestBody() payload: { reason?: string }
  ) {
    const { reason } = payload;
    
    const bid = await this.productBidService.forceRejectBid(bidId, reason);
    
    // Send notification to both buyer and seller
    if (bid.seller && bid.buyer) {
      await this.bidMessageService.createSystemMessage(
        bid.seller.toString(),
        bid.buyer.toString(),
        bid.product.toString(),
        bidId,
        `Your bid has been rejected by admin. ${reason ? `Reason: ${reason}` : ''}`
      );
    }
    
    return this.sendResponse(res, 200, 'Bid force rejected successfully', bid);
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
    
    // Send notification to both buyer and seller
    if (bid.seller && bid.buyer) {
      await this.bidMessageService.createSystemMessage(
        bid.seller.toString(),
        bid.buyer.toString(),
        bid.product.toString(),
        bidId,
        `This bid has been cancelled by admin. Reason: ${reason}`
      );
    }
    
    return this.sendResponse(res, 200, 'Bid cancelled successfully', bid);
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
}