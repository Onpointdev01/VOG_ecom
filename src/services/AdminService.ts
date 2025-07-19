import { injectable } from 'inversify';
import jwt from 'jsonwebtoken';
import { BaseService } from './BaseService';
import { Admin, IAdmin } from '../models/Admin';
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
}