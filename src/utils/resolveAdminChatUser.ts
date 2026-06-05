import crypto from 'crypto';
import { Model } from 'mongoose';
import { IAdmin, IUser } from '../models';
import { toIdString } from './mongoId';

/**
 * Platform User used as chat identity for an Admin (messages require User refs).
 */
export async function resolveAdminChatUserId(
  admin: IAdmin,
  User: Model<IUser>
): Promise<string> {
  const email = admin.email?.toLowerCase().trim();
  if (!email) {
    throw new Error('Admin email is required for messaging');
  }

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      firstName: admin.firstName || 'Support',
      lastName: admin.lastName || 'VOG',
      email,
      role: 'admin',
      verified: true,
      password: crypto.randomBytes(32).toString('hex'),
    });
  } else if (user.role !== 'admin') {
    await User.updateOne({ _id: user._id }, { role: 'admin' });
  }

  return toIdString(user._id);
}
