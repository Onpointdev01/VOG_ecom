import { Response } from 'express';
import { env } from '../../config';

/**
 * Set httpOnly cookie for refresh token
 */
export const setRefreshTokenCookie = (res: Response, token: string): void => {
  const isProduction = env.NODE_ENV === 'production';
  
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: isProduction, // Only send over HTTPS in production
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/v1/auth',
  });
};

/**
 * Clear refresh token cookie
 */
export const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
  });
};

/**
 * Get refresh token from cookie or header (for backward compatibility)
 */
export const getRefreshToken = (req: any): string | null => {
  // Try cookie first (preferred)
  if (req.cookies && req.cookies.refreshToken) {
    return req.cookies.refreshToken;
  }
  
  // Fallback to body (for backward compatibility)
  if (req.body && req.body.refreshToken) {
    return req.body.refreshToken;
  }
  
  // Fallback to header
  if (req.headers && req.headers['x-refresh-token']) {
    return req.headers['x-refresh-token'];
  }
  
  return null;
};

