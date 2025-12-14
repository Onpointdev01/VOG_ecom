import { inject, injectable } from 'inversify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { Model } from 'mongoose';
import { TYPES } from '../di';
import { IUser, ITokenBlacklist } from '../models';
import { EmailCheckResult, SignUpSellerDTO, SignUpUserDTO } from '../utils/dtos';
import AppError from '../utils/errors/AppError';
import { generateAccessToken, generateCode, generateRefreshToken, decodeToken } from '../utils/helpers';
import { sendEmail, renderTemplate } from '../utils/helpers/sendMail';
import validator from 'validator';
import { OAuth2Client } from 'google-auth-library';
import { BaseService } from './BaseService';
import { ISeller } from '../models/Seller';

export interface IAuthService {
  signupUser(payload: SignUpUserDTO): Promise<Partial<IUser>>;
  signupSeller(payload: SignUpSellerDTO): Promise<Partial<ISeller>>;
  login(email: string, password: string, type?: 'user' | 'seller' | 'admin'): Promise<{ user: Partial<IUser>; token: string; refreshToken: string }>;
  socialLogin(
    idToken: string,
    provider: string
  ): Promise<{ user: Partial<IUser>; token: string; refreshToken: string }>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  verifyEmail(code: string, email: string): Promise<string>;
  resendVerification(email: string): Promise<void>;
  checkEmail(email: string): Promise<EmailCheckResult>;
  checkBannedOrDeleted(userId: string): Promise<Partial<IUser>>;
  refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }>;
  logout(userId: string, refreshToken: string): Promise<void>;
}

@injectable()
export class AuthService extends BaseService implements IAuthService {
  private oAuth2Client: OAuth2Client;
  constructor(
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Seller) private Seller: Model<ISeller>,
    @inject(TYPES.TokenBlacklist) private TokenBlacklist: Model<ITokenBlacklist>
  ) {
    super();
    this.oAuth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  }
  async checkBannedOrDeleted(userId: string): Promise<IUser> {
    const user = await this.User.findById(userId);

    if (!user) {
      throw new AppError('user not found', 404);
    }

    if (user?.banned) {
      throw new AppError('You cannot log in', 403);
    }

    return user;
  }

  async signupUser(payload: SignUpUserDTO): Promise<Partial<IUser>> {
    // Handle both formats: {firstName, lastName} or {name}
    let { email, firstName, lastName, nationality, phoneNumber, currentLocation, role } = payload;
    let { password } = payload;
    
    console.log(`🔍 Signup request - Role received: ${role || 'undefined (will default to user)'}`);
    
    // If 'name' is provided instead of firstName/lastName, split it
    if ((payload as any).name && !firstName) {
      const nameParts = (payload as any).name.trim().split(/\s+/);
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || nameParts[0] || ''; // Use first name as last name if only one word
    }
    
    // Validate required fields before processing
    if (!firstName || !firstName.trim()) {
      throw new AppError('First name is required', 400);
    }
    if (!lastName || !lastName.trim()) {
      throw new AppError('Last name is required', 400);
    }
    if (!email || !email.trim()) {
      throw new AppError('Email is required', 400);
    }
    if (!password || !password.trim()) {
      throw new AppError('Password is required', 400);
    }
    
    // Prevent admin self-registration (role is typed as 'user' | 'seller' | undefined, but check for safety)
    if (role && role !== 'user' && role !== 'seller') {
      throw new AppError('Admin accounts cannot be created through public signup', 403);
    }

    // Normalize email (lowercase and trim)
    const normalizedEmail = email.trim().toLowerCase();
    
    // Check if user exists with this email (case-insensitive)
    const prevUser = await this.User.findOne({ 
      email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } 
    });
    if (prevUser) {
      throw new AppError(`Email ${normalizedEmail} is already registered. Please use a different email or log in.`, 400);
    }

    //hash password
    password = await bcrypt.hash(password, 10);
    
    // Generate verification code
    const verifyCode = generateCode(6);
    const hashedCode = crypto.createHash('md5').update(verifyCode).digest('hex');
    
    try {
      const newUser = await this.User.create({
        email: normalizedEmail, // Use normalized email (lowercase, trimmed)
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nationality: nationality?.trim(),
        phoneNumber: phoneNumber?.trim(),
        currentLocation: currentLocation?.trim(),
        role: role || 'user',
        verified: false, // Require email verification
        verifyCode: hashedCode,
        verifyCodeExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      });

      // Send verification email with role-specific URL
      const userRole = role || 'user';
      console.log(`📧 Preparing to send verification email for user with role: ${userRole}`);
      try {
        await this.sendVerificationEmail(normalizedEmail, firstName, verifyCode, userRole);
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Don't fail signup if email fails, but log it
      }

      return { id: newUser._id, email: normalizedEmail, firstName, lastName };
    } catch (error: any) {
      // Handle MongoDB validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.keys(error.errors || {}).map(key => {
          const err = error.errors[key];
          return `${key}: ${err.message}`;
        }).join(', ');
        console.error('User validation errors:', validationErrors);
        throw new AppError(`Validation failed: ${validationErrors}`, 400);
      }
      
      // Handle duplicate key errors (e.g., email already exists)
      if (error.name === 'MongoServerError' && error.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0] || 'field';
        throw new AppError(`${field} already exists`, 400);
      }
      
      // Re-throw AppError as-is
      if (error instanceof AppError) {
        throw error;
      }
      
      // Log and throw generic error for unexpected errors
      console.error('Unexpected error during user signup:', error);
      throw new AppError('Failed to create user account. Please try again.', 500);
    }
  }

  //signup as seller add more validation and the likes
  async signupSeller(payload: SignUpSellerDTO): Promise<Partial<ISeller>> {
    const { name, type, logo, official, user } = payload;

    console.log('signupSeller called with payload:', { name, type, logo, official, user });

    if (!user || !user.trim()) {
      throw new AppError('User ID is required', 400);
    }
    if (!name || !name.trim()) {
      throw new AppError('Seller name is required', 400);
    }
    if (!type || (type !== 'individual' && type !== 'enterprise')) {
      throw new AppError('Seller type must be either "individual" or "enterprise"', 400);
    }

    // Validate MongoDB ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(user)) {
      console.error('Invalid user ID format:', user);
      throw new AppError(`Invalid user ID format: ${user}`, 400);
    }

    console.log('Looking for user with ID:', user);

    // Find user and verify they exist
    const prevUser = await this.User.findById(user);
    if (!prevUser) {
      console.error('User not found with ID:', user);
      throw new AppError(`User not found with ID: ${user}`, 404);
    }
    
    console.log('User found:', prevUser.email, 'Role:', prevUser.role);

    // Check if user is already a seller
    const prevSeller = await this.Seller.findOne({ user });
    if (prevSeller) {
      throw new AppError(`User with email ${prevUser.email} is already registered as a seller`, 400);
    }

    try {
      const newSeller = await this.Seller.create({
        user,
        name: name.trim(),
        type,
        logo: logo?.trim() || '',
        official: official || false,
      });

      // Update the user's seller field and role
      await this.User.findByIdAndUpdate(user, { 
        seller: newSeller._id,
        role: 'seller' // Update user role to seller
      });

      return { id: newSeller._id, name, type, logo, official };
    } catch (error: any) {
      // Handle duplicate key errors
      if (error.name === 'MongoServerError' && error.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0] || 'field';
        throw new AppError(`Seller with this ${field} already exists`, 400);
      }
      
      // Re-throw AppError as-is
      if (error instanceof AppError) {
        throw error;
      }
      
      console.error('Error creating seller:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue,
        errors: error.errors
      });
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message).join(', ');
        throw new AppError(`Validation error: ${validationErrors}`, 400);
      }
      
      throw new AppError(`Failed to create boutique: ${error.message || 'Please try again.'}`, 500);
    }
  }

  login = async (
    email: string,
    password: string,
    type?: 'user' | 'seller' | 'admin'
  ): Promise<{ user: Partial<IUser>; token: string; refreshToken: string }> => {
    // Normalize email (lowercase and trim)
    const normalizedEmail = email.trim().toLowerCase();
    
    const user: IUser | null = await this.User.findOne({ email: normalizedEmail }, '+password').populate('seller');
    if (!user) {
      throw new AppError('Invalid email or password', 400);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 400);
    }

    // Type-based access control
    if (type === 'seller') {
      // For seller portal login, user must have a seller profile
      if (!user.seller) {
        throw new AppError('No seller account found. Please create a seller account first.', 403);
      }
    } else if (type === 'admin') {
      // Admin login should use /admin/signin endpoint
      throw new AppError('Please use the admin login portal.', 403);
    }

    // Check if email is verified - if not, send verification email and throw error
    if (!user.verified) {
      // Generate new verification code
      const verifyCode = generateCode(6);
      const hashedCode = crypto.createHash('md5').update(verifyCode).digest('hex');
      
      // Update user with new verification code
      user.verifyCode = hashedCode;
      user.verifyCodeExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await user.save();
      
      // Send verification email with user role
      const userRole = user.role || 'user';
      console.log(`📧 Preparing to send verification email during login for user with role: ${userRole}`);
      try {
        await this.sendVerificationEmail(email, user.firstName, verifyCode, userRole);
      } catch (emailError) {
        console.error('Failed to send verification email during login:', emailError);
        // Still throw the error, but with a message about email sending failure
        throw new AppError('Email not verified. We attempted to send a verification email but it failed. Please try again or contact support.', 403);
      }
      
      throw new AppError('Email not verified. A verification email has been sent to your email address. Please verify your email before logging in.', 403);
    }

    const token = generateAccessToken(user._id as string, user.role);
    const refreshToken = generateRefreshToken(user._id as string, user.role);

    // Store refresh token in database
    await this.User.findByIdAndUpdate(user._id, { refreshToken: refreshToken });

    // Fetch user again with seller populated to ensure we have the seller reference
    const userWithSeller = await this.User.findById(user._id).populate('seller');
    
    // Determine user type based on role and seller profile
    const hasSeller = !!userWithSeller?.seller;
    const userRole = user.role || 'user';
    
    // Type is 'seller' if user has a seller profile, otherwise use their role
    const userType = hasSeller ? 'seller' : userRole;

    const trimedUser: Partial<IUser> & { type?: string; seller?: string } = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      nationality: user.nationality,
      currentLocation: user.currentLocation,
      banned: user.banned,
      verified: user.verified,
      role: userRole,
      type: userType, // 'user' | 'seller' | 'admin'
    };

    // Include seller ID if it exists
    if (hasSeller) {
      const seller = userWithSeller.seller as any;
      const sellerId = seller._id || seller.id || seller;
      if (sellerId) {
        trimedUser.seller = sellerId.toString();
      }
    }

    return { user: trimedUser, token: token, refreshToken: refreshToken };
  };

  async socialLogin(
    idToken: string,
    provider: string
  ): Promise<{ user: Partial<IUser>; token: string; refreshToken: string }> {
    let payload: any;

    if (provider === 'google') {
      try {
        const ticket = await this.oAuth2Client.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
        // console.log(payload);
      } catch (error) {
        // Handle specific Google token verification errors, look for better way to handle it
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();

          if (/invalid token signature/i.test(errorMessage)) {
            throw new AppError('Invalid Google token', 401);
          } else if (/token used too late/i.test(errorMessage)) {
            throw new AppError('Google token has expired', 401);
          } else if (
            /wrong number of segments/i.test(errorMessage) ||
            /not enough or too many segments/i.test(errorMessage)
          ) {
            throw new AppError('Malformed Google token', 400);
          } else if (/no pem found for envelope/i.test(errorMessage)) {
            throw new AppError('Invalid Google token format', 400);
          } else if (/invalid audience/i.test(errorMessage)) {
            throw new AppError('Invalid audience in Google token', 401);
          } else if (/invalid issuer/i.test(errorMessage)) {
            throw new AppError('Invalid issuer in Google token', 401);
          } else {
            console.error('Google token verification error:', error);
            throw new AppError('Failed to verify Google token', 500);
          }
        } else {
          console.error('Unknown error during Google token verification:', error);
          throw new AppError('An unexpected error occurred', 500);
        }
      }
    } else {
      throw new AppError('Unsupported provider', 400);
    }

    const socialId = payload?.sub;
    if (!socialId) {
      throw new AppError('No user ID found in token payload', 400);
    }

    // Rest of your function remains the same
    let user = await this.User.findOne({
      'socialLogin.providerId': socialId,
      'socialLogin.provider': provider,
    });

    if (!user) {
      const userWithEmail = await this.User.findOne({ email: payload?.email });
      if (userWithEmail) {
        userWithEmail.socialLogin.push({ provider: provider, providerId: socialId });
        await userWithEmail.save();

        // Check if user has seller profile
        const userWithSeller = await this.User.findById(userWithEmail._id).populate('seller');
        const hasSeller = !!userWithSeller?.seller;
        const userRole = userWithEmail.role || 'user';
        const userType = hasSeller ? 'seller' : userRole;

        const trimedUser: Partial<IUser> & { type?: string; seller?: string } = {
          id: userWithEmail._id,
          email: userWithEmail.email,
          firstName: userWithEmail.firstName,
          lastName: userWithEmail.lastName,
          profileImageUrl: userWithEmail.profileImageUrl,
          nationality: userWithEmail.nationality,
          currentLocation: userWithEmail.currentLocation,
          banned: userWithEmail.banned,
          verified: userWithEmail.verified,
          role: userRole,
          type: userType,
        };

        if (hasSeller) {
          const seller = userWithSeller.seller as any;
          trimedUser.seller = (seller._id || seller.id || seller).toString();
        }

        return {
          user: trimedUser,
          token: generateAccessToken(userWithEmail._id as string, userRole),
          refreshToken: generateRefreshToken(userWithEmail._id as string, userRole),
        };
      } else {
        // Register new user if not found
        user = new this.User({
          email: payload?.email,
          firstName: payload?.given_name,
          lastName: payload?.family_name,
          profileImageUrl: payload?.picture,
          socialLogin: [{ provider: provider, providerId: socialId }],
          verified: true, // Google accounts are pre-verified
        });
        await user.save();
      }
    }

    // Check if user has seller profile
    const userWithSeller = await this.User.findById(user._id).populate('seller');
    const hasSeller = !!userWithSeller?.seller;
    const userRole = user.role || 'user';
    const userType = hasSeller ? 'seller' : userRole;

    const token = await generateAccessToken(user._id as string, userRole);
    const refreshToken = await generateRefreshToken(user._id as string, userRole);
    
    const trimedUser: Partial<IUser> & { type?: string; seller?: string } = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      nationality: user.nationality,
      currentLocation: user.currentLocation,
      banned: user.banned,
      verified: user.verified,
      role: userRole,
      type: userType,
    };

    if (hasSeller) {
      const seller = userWithSeller.seller as any;
      trimedUser.seller = (seller._id || seller.id || seller).toString();
    }

    return { user: trimedUser, token: token, refreshToken: refreshToken };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists (security best practice)
      return;
    }

    // Generate secure token (not code)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Store hashed token (1 hour expiry)
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await user.save();

    // Send password reset email with token (use Gmail SMTP if configured)
    try {
      await this.sendPasswordResetEmail(email, user.firstName, resetToken, user.role || 'user');
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      throw new AppError('Failed to send password reset email', 500);
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    if (!token || !password) {
      throw new AppError('Token and password are required', 400);
    }

    // Hash the provided token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with matching token and valid expiry
    const user = await this.User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Update password and clear reset token
    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    // Optionally blacklist all existing refresh tokens for this user
    // This forces re-login after password reset for security
    await this.User.findByIdAndUpdate(user._id, { refreshToken: undefined });
  }

  async checkEmail(email: string): Promise<EmailCheckResult> {
    const isValid = validator.isEmail(email);

    if (!isValid) {
      return { isValid: false, isAvailable: false, message: 'Email is invalid' };
    }

    const existingUser = await this.User.findOne({ email });
    if (existingUser) {
      return { isValid: true, isAvailable: false, message: 'Email linked to another account' };
    }

    return { isValid: true, isAvailable: true, message: 'Email is available' };
  }

  async verifyEmail(code: string, email: string): Promise<string> {
    const user = await this.User.findOne({ email });

    if (!user) throw new AppError('User not found', 404);

    if (user.verified) throw new AppError('Email already verified', 400);

    if (user.verifyCodeExpires!.getTime() < Date.now()) throw new AppError('provided code is expired', 400);

    const hashedCode = crypto.createHash('md5').update(code).digest('hex');
    if (user.verifyCode !== hashedCode) throw new AppError('code does not match code sent', 400);

    user.verified = true;
    user.verifyCodeExpires = undefined;
    user.verifyCode = undefined;

    await user.save();
    return generateAccessToken(user._id as string);
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.User.findOne({ email });
    if (!user) throw new AppError('User not found', 404);

    if (user.verified) throw new AppError('Email already verified', 403);
    
    // Generate new verification code
    const verifyCode = generateCode(6);
    const hashedCode = crypto.createHash('md5').update(verifyCode).digest('hex');
    
    // Update user with new verification code
    user.verifyCode = hashedCode;
    user.verifyCodeExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await user.save();
    
    // Send verification email with user role
    const userRole = user.role || 'user';
    console.log(`📧 Preparing to resend verification email for user with role: ${userRole}`);
    try {
      await this.sendVerificationEmail(email, user.firstName, verifyCode, userRole);
    } catch (error) {
      console.error('Failed to send verification email:', error);
      throw new AppError('Failed to send verification email. Please try again later.', 500);
    }
  }

  private async sendVerificationCode() {
    const code = generateCode(6);
    // const minutesToExpire = 10;
    // user.verifyCode = crypto.createHash('md5').update(code).digest('hex');
    // user.verifyCodeExpires = new Date(Date.now() + minutesToExpire * 60 * 1000); //should expire in 10 minutes

    // await user.save();
    const usersName = 'benjys' as string;
    await sendEmail({
      to: ['smtpbenjo@gmail.com'],
      subject: 'Email Verification',
      html: renderTemplate('src/utils/templates/password-reset.html', { usersName, code }),
    });
  }

  async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await this.TokenBlacklist.findOne({ token: refreshToken });
      if (isBlacklisted) {
        throw new AppError('Token has been revoked', 401);
      }

      const decoded = await decodeToken(refreshToken, true);
      const userId = decoded.id;
      const userRole = decoded.role;

      const user = await this.User.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Verify token matches stored token
      if (user.refreshToken !== refreshToken) {
        throw new AppError('Invalid refresh token', 401);
      }

      // Generate new tokens (rotation)
      const newAccessToken = generateAccessToken(user._id as string, user.role || userRole);
      const newRefreshToken = generateRefreshToken(user._id as string, user.role || userRole);

      // Blacklist old refresh token
      const tokenExpiry = new Date();
      tokenExpiry.setDate(tokenExpiry.getDate() + 7); // Match refresh token expiry
      await this.TokenBlacklist.create({
        token: refreshToken,
        userId: userId,
        expiresAt: tokenExpiry,
      });

      // Store new refresh token
      await this.User.findByIdAndUpdate(userId, { refreshToken: newRefreshToken });

      return { token: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Invalid refresh token', 401);
    }
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    try {
      // Blacklist the refresh token
      if (refreshToken) {
        const tokenExpiry = new Date();
        tokenExpiry.setDate(tokenExpiry.getDate() + 7); // Match refresh token expiry
        
        await this.TokenBlacklist.create({
          token: refreshToken,
          userId: userId,
          expiresAt: tokenExpiry,
        });
      }

      // Clear refresh token from user record
      await this.User.findByIdAndUpdate(userId, { refreshToken: undefined });
    } catch (error) {
      console.error('Error during logout:', error);
      // Don't throw - logout should succeed even if blacklisting fails
    }
  }

  private async sendVerificationEmail(email: string, firstName: string, code: string, role: string = 'user'): Promise<void> {
    try {
      // Check if Gmail is configured - use it for verification emails if available
      const useGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
      
      // Determine frontend URL based on user role
      let frontendUrl: string;
      if (role === 'seller') {
        // Use seller frontend URL if configured, otherwise default to production
        frontendUrl = process.env.SELLER_FRONTEND_URL || 'https://seller.st-cael.org';
        console.log(`🔍 Seller detected - Using SELLER_FRONTEND_URL: ${process.env.SELLER_FRONTEND_URL || 'not set, using default'}`);
      } else {
        // Use regular frontend URL for regular users
        frontendUrl = process.env.FRONTEND_URL || 'https://market.st-cael.org';
        console.log(`🔍 Regular user detected - Using FRONTEND_URL: ${process.env.FRONTEND_URL || 'not set, using default'}`);
      }
      
      const verificationLink = `${frontendUrl}/verify-email?code=${code}&email=${email}`;
      
      console.log(`📧 Sending verification email to: ${email} (role: ${role}, frontend: ${frontendUrl})`);
      console.log(`🔗 Verification link: ${verificationLink}`);
      await sendEmail({
        to: [email],
        subject: 'Verify Your Email Address',
        html: renderTemplate('src/utils/templates/email-verification.html', { 
          firstName, 
          code,
          verificationLink
        }),
        useGmail: useGmail, // Use Gmail if configured
      });
      console.log(`✅ Verification email sent successfully to: ${email}`);
    } catch (error: any) {
      console.error('❌ Failed to send verification email:', error);
      console.error('Error details:', {
        email,
        message: error?.message,
        response: error?.response?.data || error?.response,
      });
      // Don't throw error - allow user to resend verification
      // But log it for debugging
      throw new AppError(
        `Failed to send verification email. Please check your email configuration or try again later. Error: ${error?.message || 'Unknown error'}`,
        500
      );
    }
  }

  private async sendPasswordResetEmail(email: string, firstName: string, token: string, role: string = 'user'): Promise<void> {
    try {
      // Determine frontend URL based on user role
      let frontendUrl: string;
      if (role === 'seller') {
        // Use seller frontend URL if configured, otherwise default to production
        frontendUrl = process.env.SELLER_FRONTEND_URL || 'https://seller.st-cael.org';
      } else {
        // Use regular frontend URL for regular users
        frontendUrl = process.env.FRONTEND_URL || 'https://market.st-cael.org';
      }
      
      const resetLink = `${frontendUrl}/reset-password?token=${token}`;
      // Use Gmail SMTP for password reset if configured, otherwise use default Resend
      const useGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
      await sendEmail({
        to: [email],
        subject: 'Password Reset Request',
        html: renderTemplate('src/utils/templates/password-reset.html', {
          firstName,
          resetLink,
          token, // Include token in case link doesn't work
        }),
        useGmail, // Use Gmail SMTP if configured
      });
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      throw error;
    }
  }
}
