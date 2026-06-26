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
    // Expose under both names so old and new app code both work
    profileImageUrl: user.profileImageUrl,
    profilePicture: user.profileImageUrl,
    nationality: user.nationality,
    // Expose under both names
    phoneNumber: user.phoneNumber,
    phone: user.phoneNumber,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    currentLocation: user.currentLocation,
    role: user.role,
    verified: user.verified,
    wishlist: user.wishlist,
    hasPassword: !!user.password,
    socialLogin: user.socialLogin ?? [],
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
