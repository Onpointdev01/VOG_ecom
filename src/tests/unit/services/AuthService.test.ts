import { AuthService } from '../../../services/AuthService';
import { Model } from 'mongoose';
import { IUser, ISeller, ITokenBlacklist } from '../../../models';
import AppError from '../../../utils/errors/AppError';
import bcrypt from 'bcryptjs';
import * as tokenHelpers from '../../../utils/helpers/token';

// Mock dependencies
jest.mock('bcryptjs');
jest.mock('../../../utils/helpers/token');
jest.mock('../../../utils/helpers/sendMail');

describe('AuthService', () => {
  let authService: AuthService;
  let mockUser: Model<IUser>;
  let mockSeller: Model<ISeller>;
  let mockTokenBlacklist: Model<ITokenBlacklist>;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(
      mockUser as any,
      mockSeller as any,
      mockTokenBlacklist as any
    );
  });

  describe('signupUser', () => {
    it('should prevent admin self-registration', async () => {
      const payload = {
        email: 'admin@test.com',
        password: 'password123',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
      };

      await expect(authService.signupUser(payload as any)).rejects.toThrow(
        AppError
      );
    });

    it('should create user with email verification', async () => {
      const payload = {
        email: 'user@test.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      (mockUser.findOne as jest.Mock).mockResolvedValue(null);
      (mockUser.create as jest.Mock).mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        verified: false,
      });

      const result = await authService.signupUser(payload as any);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email', payload.email);
      expect(mockUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: payload.email,
          verified: false,
          verifyCode: expect.any(String),
        })
      );
    });
  });

  describe('login', () => {
    it('should reject unverified users', async () => {
      const email = 'user@test.com';
      const password = 'password123';

      (mockUser.findOne as jest.Mock).mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        email,
        password: 'hashedPassword',
        verified: false,
        role: 'user',
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(authService.login(email, password)).rejects.toThrow(
        AppError
      );
    });

    it('should generate tokens with role', async () => {
      const email = 'user@test.com';
      const password = 'password123';
      const userId = '507f1f77bcf86cd799439011';

      (mockUser.findOne as jest.Mock).mockResolvedValue({
        _id: userId,
        email,
        password: 'hashedPassword',
        verified: true,
        role: 'user',
        firstName: 'Test',
        lastName: 'User',
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (tokenHelpers.generateAccessToken as jest.Mock).mockReturnValue('accessToken');
      (tokenHelpers.generateRefreshToken as jest.Mock).mockReturnValue('refreshToken');

      const result = await authService.login(email, password);

      expect(result).toHaveProperty('token', 'accessToken');
      expect(result).toHaveProperty('refreshToken', 'refreshToken');
      expect(tokenHelpers.generateAccessToken).toHaveBeenCalledWith(userId, 'user');
    });
  });

  describe('refreshToken', () => {
    it('should reject blacklisted tokens', async () => {
      const refreshToken = 'blacklistedToken';

      (mockTokenBlacklist.findOne as jest.Mock).mockResolvedValue({
        token: refreshToken,
      });

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow(
        AppError
      );
    });

    it('should rotate refresh token', async () => {
      const oldRefreshToken = 'oldToken';
      const userId = '507f1f77bcf86cd799439011';
      const newRefreshToken = 'newToken';

      (mockTokenBlacklist.findOne as jest.Mock).mockResolvedValue(null);
      (tokenHelpers.decodeToken as jest.Mock).mockReturnValue({
        id: userId,
        role: 'user',
      });
      (mockUser.findById as jest.Mock).mockResolvedValue({
        _id: userId,
        refreshToken: oldRefreshToken,
        role: 'user',
      });
      (tokenHelpers.generateAccessToken as jest.Mock).mockReturnValue('newAccessToken');
      (tokenHelpers.generateRefreshToken as jest.Mock).mockReturnValue(newRefreshToken);

      const result = await authService.refreshToken(oldRefreshToken);

      expect(result).toHaveProperty('token', 'newAccessToken');
      expect(result).toHaveProperty('refreshToken', newRefreshToken);
      expect(mockTokenBlacklist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token: oldRefreshToken,
          userId,
        })
      );
    });
  });

  describe('logout', () => {
    it('should blacklist refresh token', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const refreshToken = 'tokenToBlacklist';

      await authService.logout(userId, refreshToken);

      expect(mockTokenBlacklist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token: refreshToken,
          userId,
        })
      );
      expect(mockUser.findByIdAndUpdate).toHaveBeenCalledWith(userId, {
        refreshToken: undefined,
      });
    });
  });
});

