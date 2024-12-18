/* eslint-disable @typescript-eslint/no-explicit-any */
import jwt from 'jsonwebtoken';
import { env } from '../../config';

const { JWT_SECRET, JWT_EXPIRES, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES } = env;

//generates jwt access token from user Id.
const generateAccessToken = (id: string): string => {
  return jwt.sign({ id }, JWT_SECRET as string, {
    expiresIn: JWT_EXPIRES,
  });
};

const generateRefreshToken = (id: string): string => {
  return jwt.sign({ id }, JWT_REFRESH_SECRET as string, { expiresIn: JWT_REFRESH_EXPIRES });
};

const decodeToken = (token: string, isRefreshToken: boolean = false): any => {
  try {
    const secret = isRefreshToken ? JWT_REFRESH_SECRET : JWT_SECRET;
    return jwt.verify(token, secret as string);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// const generateAccessToken = (id: string): string => {
//   return jwt.sign({ id, type: 'access' }, JWT_SECRET as string, {
//     expiresIn: JWT_EXPIRES,
//   });
// };

// // Generates JWT refresh token from user ID.
// const generateRefreshToken = (id: string): string => {
//   return jwt.sign({ id, type: 'refresh' }, JWT_REFRESH_SECRET as string, {
//     expiresIn: JWT_REFRESH_EXPIRES,
//   });
// };

export { generateAccessToken, generateRefreshToken, decodeToken };
