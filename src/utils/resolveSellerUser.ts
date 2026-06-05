import crypto from 'crypto';
import mongoose, { Model } from 'mongoose';
import { IAdmin, ISeller, IUser, Seller } from '../models';
import AppError from './errors/AppError';
import { toIdString } from './mongoId';

function sellerAccountRefToString(ref: unknown): string {
  if (ref == null) return '';
  if (typeof ref === 'string') return ref;
  if (ref instanceof mongoose.Types.ObjectId) return ref.toHexString();
  if (mongoose.isValidObjectId(ref)) {
    return new mongoose.Types.ObjectId(ref as mongoose.Types.ObjectId | string).toHexString();
  }
  if (typeof ref === 'object' && ref !== null && '_id' in ref) {
    return sellerAccountRefToString((ref as { _id: unknown })._id);
  }
  return toIdString(ref);
}

/**
 * Resolve the platform User id for a seller (conversations/messages use User, not Admin).
 * Repairs sellers that incorrectly store an Admin document id in `seller.user`.
 */
export async function resolveSellerUserId(
  seller: ISeller,
  User: Model<IUser>,
  Admin: Model<IAdmin>,
  options: { repair?: boolean } = { repair: true }
): Promise<string> {
  const sellerId = toIdString(seller._id);
  const rawRef = seller.user ? sellerAccountRefToString(seller.user) : '';
  if (!rawRef) {
    throw new AppError('Seller has no linked account', 400);
  }

  let user = await User.findById(rawRef);
  if (user) {
    return sellerAccountRefToString(user._id);
  }

  const userBySeller = await User.findOne({ seller: seller._id });
  if (userBySeller) {
    if (options.repair !== false) {
      await Seller.updateOne({ _id: seller._id }, { user: userBySeller._id });
    }
    return sellerAccountRefToString(userBySeller._id);
  }

  const admin = await Admin.findById(rawRef);
  if (admin) {
    let platformUser = await User.findOne({ email: admin.email });
    if (!platformUser) {
      platformUser = await User.create({
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: 'seller',
        verified: true,
        password: crypto.randomBytes(32).toString('hex'),
        seller: seller._id,
      });
    } else {
      const updates: Partial<IUser> = {};
      if (!platformUser.seller) {
        updates.seller = seller._id as IUser['seller'];
      }
      if (platformUser.role !== 'seller' && platformUser.role !== 'admin') {
        updates.role = 'seller';
      }
      if (Object.keys(updates).length > 0) {
        await User.updateOne({ _id: platformUser._id }, updates);
      }
    }

    if (options.repair !== false) {
      await Seller.updateOne({ _id: seller._id }, { user: platformUser._id });
    }
    return sellerAccountRefToString(platformUser._id);
  }

  throw new AppError(
    'Seller user account not found. The store owner account may have been removed.',
    400
  );
}
