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
} from 'inversify-express-utils';
import { Response } from 'express';
import TYPES from '../di';
import { AdminService, CreateAdminRequest } from '../services/AdminService';
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
  constructor(@inject(TYPES.AdminService) private adminService: AdminService) {
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
}