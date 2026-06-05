import { inject, injectable } from 'inversify';
import TYPES from '../di';
import {
  IPlatformSettings,
  OrderApprovalMode,
  PLATFORM_SETTINGS_ID,
  PlatformSettings,
} from '../models/PlatformSettings';
import { Model } from 'mongoose';

const VALID_MODES: OrderApprovalMode[] = ['ADMIN_ONLY', 'SELLER_ALLOWED'];

function envDefaultMode(): OrderApprovalMode {
  const raw = (process.env.ORDER_APPROVAL_MODE || 'ADMIN_ONLY').toUpperCase();
  return VALID_MODES.includes(raw as OrderApprovalMode)
    ? (raw as OrderApprovalMode)
    : 'ADMIN_ONLY';
}

@injectable()
export class PlatformSettingsService {
  constructor(
    @inject(TYPES.PlatformSettings)
    private PlatformSettingsModel: Model<IPlatformSettings>
  ) {}

  async getOrderApprovalMode(): Promise<OrderApprovalMode> {
    const doc = await this.PlatformSettingsModel.findById(PLATFORM_SETTINGS_ID).lean();
    if (doc?.orderApprovalMode && VALID_MODES.includes(doc.orderApprovalMode)) {
      return doc.orderApprovalMode;
    }
    return envDefaultMode();
  }

  async isSellerOrderApprovalAllowed(): Promise<boolean> {
    return (await this.getOrderApprovalMode()) === 'SELLER_ALLOWED';
  }

  async getPlatformSettings(): Promise<{ orderApprovalMode: OrderApprovalMode }> {
    return { orderApprovalMode: await this.getOrderApprovalMode() };
  }

  async setOrderApprovalMode(mode: OrderApprovalMode): Promise<{ orderApprovalMode: OrderApprovalMode }> {
    if (!VALID_MODES.includes(mode)) {
      throw new Error('Invalid order approval mode');
    }
    await this.PlatformSettingsModel.findByIdAndUpdate(
      PLATFORM_SETTINGS_ID,
      { orderApprovalMode: mode },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { orderApprovalMode: mode };
  }
}
