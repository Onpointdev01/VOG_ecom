import { inject } from 'inversify';
import {
  controller,
  httpGet,
  httpPost,
  httpPut,
  httpDelete,
  request,
  requestBody,
  requestParam,
  response,
  queryParam,
} from 'inversify-express-utils';
import { Request, Response } from 'express';
import TYPES from '../di';
import { AdminService, CreateAdminRequest } from '../services/AdminService';
import { IBidMessageService, IOfferService, IMessageService } from '../services';
import { OrderService } from '../services/OrderService';
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
    @inject(TYPES.OfferService) private offerService: IOfferService,
    @inject(TYPES.MessageService) private messageService: IMessageService,
    @inject(TYPES.BidMessageService) private bidMessageService: IBidMessageService,
    @inject(TYPES.OrderService) private orderService: OrderService
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

  @httpGet('/users/:userId', TYPES.RequireAdmin)
  public async getUserById(
    @response() res: Response,
    @requestParam('userId') userId: string
  ) {
    const user = await this.adminService.getUserById(userId);
    const plain = { ...(user as unknown as Record<string, unknown>) };
    const seller = plain.seller;
    if (seller && typeof seller === 'object') {
      delete plain.seller;
    }
    return this.sendResponse(res, 200, 'User retrieved successfully', {
      user: plain,
      seller: seller || null,
    });
  }

  @httpPut('/users/:userId', TYPES.RequireAdmin)
  public async updateUser(
    @response() res: Response,
    @requestParam('userId') userId: string,
    @requestBody() payload: Record<string, unknown>
  ) {
    const user = await this.adminService.updateUserById(userId, payload as never);
    return this.sendResponse(res, 200, 'User updated successfully', user);
  }

  @httpPut('/users/:userId/seller', TYPES.RequireAdmin)
  public async updateUserSeller(
    @response() res: Response,
    @requestParam('userId') userId: string,
    @requestBody() payload: Record<string, unknown>
  ) {
    const seller = await this.adminService.updateSellerForUser(userId, payload);
    return this.sendResponse(res, 200, 'Seller updated successfully', seller);
  }

  @httpGet('/sellers', TYPES.RequireAdmin)
  public async listSellers(
    @response() res: Response,
    @queryParam('page') page: string = '1',
    @queryParam('limit') limit: string = '20',
    @queryParam('search') search?: string
  ) {
    const result = await this.adminService.listSellersForAdmin(
      Math.max(1, parseInt(page, 10) || 1),
      Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
      search
    );
    return this.sendResponse(res, 200, 'Sellers retrieved successfully', result);
  }

  @httpPut('/sellers/:sellerId/promotion', TYPES.RequireAdmin)
  public async updateSellerPromotion(
    @response() res: Response,
    @requestParam('sellerId') sellerId: string,
    @requestBody() payload: Record<string, unknown>
  ) {
    const seller = await this.adminService.updateSellerById(sellerId, payload);
    return this.sendResponse(res, 200, 'Seller promotion updated successfully', seller);
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
    @requestBody()
    payload: {
      name: string;
      description?: string;
      parent?: string | null;
      isActive?: boolean;
      imageUrl?: string;
      attributes?: Array<{ attribute: string; isRequired?: boolean; displayOrder?: number }>;
    }
  ) {
    const { name, description, parent, isActive, imageUrl, attributes } = payload;

    if (!name?.trim()) {
      throw new AppError('Category name is required', 400);
    }

    const category = await this.adminService.createCategory({
      name,
      description,
      parent,
      isActive,
      imageUrl,
      attributes,
    });
    return this.sendResponse(res, 201, 'Category created successfully', category);
  }

  @httpPut('/categories/:categoryId', TYPES.RequireAdmin)
  public async updateCategory(
    @response() res: Response,
    @requestParam('categoryId') categoryId: string,
    @requestBody()
    payload: {
      name?: string;
      description?: string;
      parent?: string | null;
      isActive?: boolean;
      imageUrl?: string;
      attributes?: Array<{ attribute: string; isRequired?: boolean; displayOrder?: number }>;
    }
  ) {
    const { name, description, parent, isActive, imageUrl, attributes } = payload;

    if (
      !name &&
      description === undefined &&
      parent === undefined &&
      isActive === undefined &&
      imageUrl === undefined &&
      attributes === undefined
    ) {
      throw new AppError('At least one field is required for update', 400);
    }

    const category = await this.adminService.updateCategory(categoryId, {
      name,
      description,
      parent,
      isActive,
      imageUrl,
      attributes,
    });
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
      attributes,
      isActive,
      isRecommended,
      isFlash,
    } = payload;

    // Basic validation
    if (!name?.trim() || !description?.trim() || !brand || !category) {
      throw new AppError('Name, description, brand, and category are required', 400);
    }

    const imageList = Array.isArray(images) ? images.filter(Boolean) : [];
    if (imageList.length === 0) {
      throw new AppError('At least one product image is required', 400);
    }

    const adminId = res.locals.admin;

    const product = await this.adminService.createProduct({
      name: name.trim(),
      description: description.trim(),
      brand,
      category,
      productType: productType || 'simple',
      price: price !== undefined && price !== '' ? Number(price) : undefined,
      originalPrice:
        originalPrice !== undefined && originalPrice !== '' ? Number(originalPrice) : undefined,
      condition,
      color,
      quantityAvailable:
        quantityAvailable !== undefined && quantityAvailable !== ''
          ? Number(quantityAvailable)
          : undefined,
      images: imageList,
      attributes: Array.isArray(attributes) ? attributes : undefined,
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
  @httpGet('/orders/payment-stats', TYPES.RequireAdmin)
  public async getOrderPaymentStats(@response() res: Response) {
    const stats = await this.adminService.getOrderPaymentStats();
    return this.sendResponse(res, 200, 'Order payment statistics retrieved successfully', stats);
  }

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
    @queryParam('paymentMethod') paymentMethod?: string,
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

    if (paymentMethod) {
      filters.paymentMethod = paymentMethod;
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
    @request() req: Request,
    @requestParam('orderId') orderId: string,
    @requestBody() payload: { orderStatus: string }
  ) {
    const { orderStatus } = payload;
    const admin = (req as Request & { user?: { _id: string } }).user;
    const adminUserId = admin?._id?.toString() || '';
    const current = await this.orderService.getOrderById(orderId);

    let order;
    if (current.orderStatus === 'PENDING' && orderStatus === 'CONFIRMED') {
      order = await this.orderService.approveOrderByAdmin(orderId, adminUserId);
    } else if (current.orderStatus === 'PENDING' && orderStatus === 'CANCELLED') {
      order = await this.orderService.rejectOrderByAdmin(orderId, adminUserId);
    } else {
      order = await this.orderService.updateOrderStatus(
        orderId,
        orderStatus,
        adminUserId ? { userId: adminUserId, role: 'ADMIN' } : undefined
      );
    }

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

    const order = await this.orderService.updatePaymentStatus(orderId, paymentStatus);

    return this.sendResponse(res, 200, 'Order payment status updated successfully', order);
  }

  @httpPut('/orders/:orderId/mark-paid', TYPES.RequireAdmin)
  public async markOrderAsPaid(
    @response() res: Response,
    @request() req: Request,
    @requestParam('orderId') orderId: string,
    @requestBody() payload: { paymentReference?: string; note?: string }
  ) {
    const admin = (req as Request & { admin?: { _id: string } }).admin;
    const adminId = admin?._id?.toString();
    if (!adminId) {
      throw new AppError('Admin not authenticated', 401);
    }

    const order = await this.orderService.recordOrderPaidByAdmin(orderId, adminId, {
      paymentReference: payload?.paymentReference,
      note: payload?.note,
    });

    return this.sendResponse(res, 200, 'Order marked as paid successfully', order);
  }

  @httpGet('/orders/:orderId', TYPES.RequireAdmin)
  public async getOrderDetails(@response() res: Response, @requestParam('orderId') orderId: string) {
    const order = await this.adminService.getOrderDetails(orderId);
    return this.sendResponse(res, 200, 'Order details retrieved successfully', order);
  }

  // =====================================
  // OFFER MANAGEMENT ENDPOINTS (canonical)
  // =====================================

  @httpGet('/offers', TYPES.RequireAdmin)
  public async getAllOffers(
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
    const filters = this.buildOfferFilters({
      status,
      productId,
      buyerId,
      sellerId,
      dateFrom,
      dateTo,
    });
    const result = await this.offerService.getAllOffersForAdmin(
      filters,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
      search
    );
    return this.sendResponse(res, 200, 'Offers retrieved successfully', result);
  }

  @httpGet('/offers/statistics', TYPES.RequireAdmin)
  public async getOfferStatistics(@response() res: Response) {
    const stats = await this.offerService.getOfferStatistics();
    return this.sendResponse(res, 200, 'Offer statistics retrieved successfully', stats);
  }

  @httpGet('/offers/analytics', TYPES.RequireAdmin)
  public async getOfferAnalytics(
    @response() res: Response,
    @queryParam('period') period?: string,
    @queryParam('dateFrom') dateFrom?: string,
    @queryParam('dateTo') dateTo?: string
  ) {
    const analytics = await this.offerService.getOfferAnalytics(
      period || 'weekly',
      dateFrom,
      dateTo
    );
    return this.sendResponse(res, 200, 'Offer analytics retrieved successfully', analytics);
  }

  @httpGet('/offers/:offerId', TYPES.RequireAdmin)
  public async getOfferDetails(@response() res: Response, @requestParam('offerId') offerId: string) {
    const offer = await this.offerService.getOfferById(offerId);
    if (!offer) {
      throw new AppError('Offer not found', 404);
    }
    return this.sendResponse(res, 200, 'Offer details retrieved successfully', offer);
  }

  @httpGet('/offer-messages', TYPES.RequireAdmin)
  public async getAllOfferMessages(
    @response() res: Response,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('productId') productId?: string,
    @queryParam('conversationId') conversationId?: string,
    @queryParam('type') type?: string
  ) {
    const messages = await this.messageService.getAllMessagesForAdmin(
      { productId, conversationId, type },
      parseInt(page || '1', 10),
      parseInt(limit || '50', 10)
    );
    return this.sendResponse(res, 200, 'Offer messages retrieved successfully', messages);
  }

  @httpGet('/products/with-offers', TYPES.RequireAdmin)
  public async getProductsWithOffers(
    @response() res: Response,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('search') search?: string
  ) {
    const products = await this.offerService.getProductsWithOffers(
      { search },
      parseInt(page || '1', 10),
      parseInt(limit || '10', 10)
    );
    return this.sendResponse(res, 200, 'Products with offers retrieved successfully', products);
  }

  @httpGet('/products/:productId/offers', TYPES.RequireAdmin)
  public async getProductOffers(
    @response() res: Response,
    @requestParam('productId') productId: string
  ) {
    const data = await this.offerService.getProductOffersForAdmin(productId);
    return this.sendResponse(res, 200, 'Product offers retrieved successfully', data);
  }

  @httpPut('/users/:userId/offer-ban', TYPES.RequireAdmin)
  public async banUserFromOffers(
    @response() res: Response,
    @requestParam('userId') userId: string,
    @requestBody() payload: { reason: string; expiresAt?: string }
  ) {
    if (!payload?.reason?.trim()) {
      throw new AppError('Reason is required for offer ban', 400);
    }
    const user = await this.adminService.banUserFromBidding(
      userId,
      payload.reason,
      payload.expiresAt ? new Date(payload.expiresAt) : undefined
    );
    return this.sendResponse(res, 200, 'User banned from making offers successfully', user);
  }

  @httpPut('/users/:userId/offer-unban', TYPES.RequireAdmin)
  public async unbanUserFromOffers(
    @response() res: Response,
    @requestParam('userId') userId: string
  ) {
    const user = await this.adminService.unbanUserFromBidding(userId);
    return this.sendResponse(res, 200, 'User unbanned from making offers successfully', user);
  }

  // =====================================
  // BID MANAGEMENT ENDPOINTS (deprecated — use /admin/offers)
  // =====================================

  private buildOfferFilters(params: {
    status?: string;
    productId?: string;
    buyerId?: string;
    sellerId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Record<string, unknown> {
    const filters: Record<string, unknown> = {};
    if (params.status) filters.status = params.status;
    if (params.productId) filters.product = params.productId;
    if (params.buyerId) filters.buyer = params.buyerId;
    if (params.sellerId) filters.seller = params.sellerId;
    if (params.dateFrom || params.dateTo) {
      filters.createdAt = {};
      if (params.dateFrom) {
        (filters.createdAt as Record<string, Date>).$gte = new Date(params.dateFrom);
      }
      if (params.dateTo) {
        (filters.createdAt as Record<string, Date>).$lte = new Date(params.dateTo);
      }
    }
    return filters;
  }

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
    res.setHeader('X-API-Deprecated', 'true');
    const filters = this.buildOfferFilters({
      status,
      productId,
      buyerId,
      sellerId,
      dateFrom,
      dateTo,
    });
    const result = await this.offerService.getAllOffersForAdmin(
      filters,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
      search
    );
    return this.sendResponse(res, 200, 'Bids retrieved successfully (deprecated)', {
      ...result,
      bids: result.offers,
    });
  }

  @httpGet('/bids/statistics', TYPES.RequireAdmin)
  public async getBidStatistics(@response() res: Response) {
    res.setHeader('X-API-Deprecated', 'true');
    const stats = await this.offerService.getOfferStatistics();
    return this.sendResponse(res, 200, 'Bid statistics retrieved successfully (deprecated)', {
      ...stats,
      totalBids: stats.totalOffers,
      pendingBids: stats.pendingOffers,
      acceptedBids: stats.acceptedOffers,
      rejectedBids: stats.rejectedOffers,
      avgBidPrice: stats.avgOfferAmount,
    });
  }

  @httpGet('/bids/:bidId', TYPES.RequireAdmin)
  public async getBidDetails(@response() res: Response, @requestParam('bidId') bidId: string) {
    res.setHeader('X-API-Deprecated', 'true');
    const offer = await this.offerService.getOfferById(bidId);
    if (!offer) {
      throw new AppError('Bid not found', 404);
    }
    return this.sendResponse(res, 200, 'Bid details retrieved successfully (deprecated)', offer);
  }

  @httpGet('/bid-messages', TYPES.RequireAdmin)
  public async getAllBidMessages(
    @response() res: Response,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('productId') productId?: string,
    @queryParam('type') type?: string
  ) {
    res.setHeader('X-API-Deprecated', 'true');
    const messages = await this.messageService.getAllMessagesForAdmin(
      { productId, type },
      parseInt(page || '1', 10),
      parseInt(limit || '50', 10)
    );
    return this.sendResponse(res, 200, 'Bid messages retrieved successfully (deprecated)', messages);
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
    @queryParam('period') period?: string,
    @queryParam('dateFrom') dateFrom?: string,
    @queryParam('dateTo') dateTo?: string
  ) {
    res.setHeader('X-API-Deprecated', 'true');
    const analytics = await this.offerService.getOfferAnalytics(
      period || 'weekly',
      dateFrom,
      dateTo
    );
    return this.sendResponse(res, 200, 'Bid analytics retrieved successfully (deprecated)', analytics);
  }

  @httpGet('/products/with-bids', TYPES.RequireAdmin)
  public async getProductsWithBids(
    @response() res: Response,
    @queryParam('page') page?: string,
    @queryParam('limit') limit?: string,
    @queryParam('search') search?: string
  ) {
    res.setHeader('X-API-Deprecated', 'true');
    const products = await this.offerService.getProductsWithOffers(
      { search },
      parseInt(page || '1', 10),
      parseInt(limit || '10', 10)
    );
    return this.sendResponse(res, 200, 'Products with bids retrieved successfully (deprecated)', products);
  }

  @httpGet('/products/:productId/bids', TYPES.RequireAdmin)
  public async getProductBids(
    @response() res: Response,
    @requestParam('productId') productId: string
  ) {
    res.setHeader('X-API-Deprecated', 'true');
    const data = await this.offerService.getProductOffersForAdmin(productId);
    return this.sendResponse(res, 200, 'Product bids retrieved successfully (deprecated)', {
      ...data,
      bids: data.offers,
    });
  }
}