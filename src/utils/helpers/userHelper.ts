import { IUser } from '../../models';

/** Canonical email for lookups and outbound mail (trim + lowercase). */
export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function mapUserProfile(user: IUser): any {
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    profileImageUrl: user.profileImageUrl,
    nationality: user.nationality,
    phoneNumber: user.phoneNumber,
    currentLocation: user.currentLocation,
    role: user.role,
    verified: user.verified,
    wishlist: user.wishlist,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const nonUpdatableFields = [
  'password',
  'role',
  'refreshToken',
  'email',
  'banned',
  'banReason',
  'banExpires',
  'socialLogin',
  'createdAt',
  'updatedAt',
  '__v',
];

export { mapUserProfile, nonUpdatableFields };
