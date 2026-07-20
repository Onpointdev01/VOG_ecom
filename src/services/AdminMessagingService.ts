import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import TYPES from '../di';
import { IAdmin, IAdminEmailBroadcast, ISeller, IUser } from '../models';
import AppError from '../utils/errors/AppError';
import { BaseService } from './BaseService';
import { sendEmail } from '../utils/helpers/sendMail';
import { ConversationDto, IConversationService } from './ConversationService';
import { IMessageService } from './MessageService';
import { IMessage } from '../models';
import { resolveAdminChatUserId } from '../utils/resolveAdminChatUser';
import { toIdString } from '../utils/mongoId';
import { NotificationService } from './NotificationService';

export type EmailAudience = 'buyers' | 'sellers' | 'everyone';

export interface EmailBroadcastListItem {
  id: string;
  subject: string;
  audience: EmailAudience;
  sent: number;
  total: number;
  failed: number;
  bodyPreview: string;
  createdAt: string;
}

export interface EmailBroadcastDetail extends EmailBroadcastListItem {
  text?: string;
  html: string;
  failures?: string[];
}

export interface IAdminMessagingService {
  sendBroadcastEmail(
    admin: IAdmin,
    params: {
      audience: EmailAudience;
      subject: string;
      html?: string;
      text?: string;
    }
  ): Promise<{
    id: string;
    audience: EmailAudience;
    total: number;
    sent: number;
    failed: number;
    recipients: string[];
    failures?: string[];
  }>;
  listEmailBroadcasts(limit?: number): Promise<EmailBroadcastListItem[]>;
  getEmailBroadcast(broadcastId: string): Promise<EmailBroadcastDetail>;
  listSellerConversations(admin: IAdmin): Promise<ConversationDto[]>;
  openSellerConversation(
    admin: IAdmin,
    sellerId: string,
    text?: string
  ): Promise<ConversationDto>;
  getConversationMessages(
    admin: IAdmin,
    conversationId: string
  ): Promise<{ conversation: ConversationDto; messages: IMessage[] }>;
  sendAdminChatMessage(
    admin: IAdmin,
    conversationId: string,
    text: string
  ): Promise<unknown>;
  listSellersForPicker(): Promise<Array<{ id: string; name: string; logo?: string }>>;
}

@injectable()
export class AdminMessagingService extends BaseService implements IAdminMessagingService {
  constructor(
    @inject(TYPES.User) private User: Model<IUser>,
    @inject(TYPES.Seller) private Seller: Model<ISeller>,
    @inject(TYPES.AdminEmailBroadcast)
    private AdminEmailBroadcast: Model<IAdminEmailBroadcast>,
    @inject(TYPES.ConversationService) private conversationService: IConversationService,
    @inject(TYPES.MessageService) private messageService: IMessageService,
    @inject(TYPES.NotificationService) private notificationService: NotificationService
  ) {
    super();
  }

  private mapBroadcastListItem(doc: IAdminEmailBroadcast): EmailBroadcastListItem {
    const plain = doc.text?.trim() || doc.subject;
    const bodyPreview = plain.length > 120 ? `${plain.slice(0, 120)}…` : plain;
    return {
      id: toIdString(doc._id),
      subject: doc.subject,
      audience: doc.audience,
      sent: doc.sent,
      total: doc.total,
      failed: doc.failed,
      bodyPreview,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  private async resolveRecipients(audience: EmailAudience): Promise<{ id: string; email: string }[]> {
    const baseQuery = {
      banned: { $ne: true },
      email: { $exists: true, $nin: [null, ''] },
    };

    let users: { _id: unknown; email: string }[] = [];

    if (audience === 'buyers') {
      users = await this.User.find({
        ...baseQuery,
        $or: [{ role: 'buyer' }, { seller: { $exists: false } }, { seller: null }],
      })
        .select('_id email')
        .lean();
    } else if (audience === 'sellers') {
      users = await this.User.find({
        ...baseQuery,
        $or: [{ role: 'seller' }, { seller: { $exists: true, $ne: null } }],
      })
        .select('_id email')
        .lean();
    } else {
      users = await this.User.find(baseQuery).select('_id email').lean();
    }

    const seen = new Set<string>();
    const result: { id: string; email: string }[] = [];
    for (const u of users) {
      const email = String(u.email || '').trim().toLowerCase();
      if (email.includes('@') && !seen.has(email)) {
        seen.add(email);
        result.push({ id: toIdString(u._id), email });
      }
    }
    return result;
  }

  async listEmailBroadcasts(limit = 50): Promise<EmailBroadcastListItem[]> {
    const rows = await this.AdminEmailBroadcast.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return rows.map((row) => {
      const plain = String(row.text || '').trim() || row.subject;
      const bodyPreview = plain.length > 120 ? `${plain.slice(0, 120)}…` : plain;
      return {
        id: toIdString(row._id),
        subject: row.subject,
        audience: row.audience,
        sent: row.sent,
        total: row.total,
        failed: row.failed,
        bodyPreview,
        createdAt: new Date(row.createdAt).toISOString(),
      };
    });
  }

  async getEmailBroadcast(broadcastId: string): Promise<EmailBroadcastDetail> {
    const doc = await this.AdminEmailBroadcast.findById(broadcastId).lean();
    if (!doc) {
      throw new AppError('Email not found', 404);
    }
    const base = this.mapBroadcastListItem(doc as unknown as IAdminEmailBroadcast);
    return {
      ...base,
      text: doc.text,
      html: doc.html,
      failures: doc.failures,
    };
  }

  async sendBroadcastEmail(
    admin: IAdmin,
    params: {
      audience: EmailAudience;
      subject: string;
      html: string;
      text?: string;
    }
  ): Promise<{
    id: string;
    audience: EmailAudience;
    total: number;
    sent: number;
    failed: number;
    recipients: string[];
    failures?: string[];
  }> {
    const subject = params.subject?.trim();
    const escapedText = params.text
      ? params.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br/>')
      : '';
    const html =
      params.html?.trim() ||
      (escapedText ? `<div style="font-family:sans-serif;line-height:1.5">${escapedText}</div>` : '');

    if (!subject) {
      throw new AppError('Subject is required', 400);
    }
    if (!html) {
      throw new AppError('Message body is required', 400);
    }

    const recipients = await this.resolveRecipients(params.audience);
    if (recipients.length === 0) {
      throw new AppError('No recipients found for this audience', 404);
    }

    let sent = 0;
    const failures: string[] = [];
    const concurrency = 5;

    const sendOne = async (recipient: { id: string; email: string }) => {
      try {
        await sendEmail({ subject, html, to: [recipient.email] });
        sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Send failed';
        console.error(`Broadcast failed for ${recipient.email}:`, message);
        failures.push(`${recipient.email}: ${message}`);
      }
    };

    for (let i = 0; i < recipients.length; i += concurrency) {
      const batch = recipients.slice(i, i + concurrency);
      await Promise.all(batch.map((r) => sendOne(r)));
    }

    if (sent === 0) {
      const hint =
        failures[0] ||
        'Check SMTP_USER, SMTP_PASS, and EMAIL_FROM in .env';
      throw new AppError(
        failures.length > 0 ? `Email delivery failed: ${hint}` : 'Email delivery failed',
        failures.some((f) => f.includes('SMTP')) ? 503 : 502
      );
    }

    // Fire push + in-app notifications in the background — don't block the response
    const notifTarget: 'buyer' | 'seller' | 'both' =
      params.audience === 'buyers' ? 'buyer' : params.audience === 'sellers' ? 'seller' : 'both';
    void Promise.all(
      recipients.map((r) =>
        this.notificationService.emit({
          userId: r.id,
          type: 'promotional',
          target: notifTarget,
          title: subject,
          body: params.text?.trim() || subject,
          inAppOnly: false,
        })
      )
    );

    const failedCount = recipients.length - sent;
    const saved = await this.AdminEmailBroadcast.create({
      admin: admin._id,
      audience: params.audience,
      subject,
      text: params.text?.trim() || undefined,
      html,
      total: recipients.length,
      sent,
      failed: failedCount,
      ...(failures.length > 0 ? { failures: failures.slice(0, 20) } : {}),
    });

    return {
      id: toIdString(saved._id),
      audience: params.audience,
      total: recipients.length,
      sent,
      failed: failedCount,
      recipients: recipients.slice(0, 20).map((r) => r.email),
      ...(failures.length > 0 ? { failures: failures.slice(0, 5) } : {}),
    };
  }

  async listSellerConversations(admin: IAdmin) {
    return this.conversationService.getAdminSellerConversations(toIdString(admin._id));
  }

  async openSellerConversation(admin: IAdmin, sellerId: string, text?: string) {
    return this.conversationService.createOrGetAdminSellerConversation(admin, sellerId, {
      text,
    });
  }

  async getConversationMessages(admin: IAdmin, conversationId: string) {
    const adminChatUserId = await resolveAdminChatUserId(admin, this.User);
    const conversation = await this.conversationService.getConversationDetailForAdmin(
      conversationId,
      adminChatUserId
    );
    const messages = await this.messageService.getMessagesForConversation(
      conversationId,
      adminChatUserId
    );
    return { conversation, messages };
  }

  async listSellersForPicker() {
    const rows = await this.Seller.find({ status: { $ne: 'suspended' } })
      .populate('user', 'firstName lastName email')
      .select('name logo status user')
      .sort({ name: 1 })
      .lean();

    return rows.map((s) => {
      const user = s.user as
        | { firstName?: string; lastName?: string; email?: string }
        | null
        | undefined;
      const owner = user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
        : '';
      const email = user?.email ? String(user.email) : '';
      const subtitle = owner || email;
      const displayName = subtitle
        ? `${String(s.name || 'Seller')} — ${subtitle}`
        : String(s.name || 'Seller');

      return {
        id: toIdString(s._id),
        name: displayName,
        logo: s.logo as string | undefined,
      };
    });
  }

  async sendAdminChatMessage(admin: IAdmin, conversationId: string, text: string) {
    const trimmed = text?.trim();
    if (!trimmed) {
      throw new AppError('Message text is required', 400);
    }
    const adminChatUserId = await resolveAdminChatUserId(admin, this.User);
    await this.conversationService.getConversationDetailForAdmin(
      conversationId,
      adminChatUserId
    );
    return this.messageService.sendMessageInConversation(
      conversationId,
      adminChatUserId,
      trimmed
    );
  }
}
