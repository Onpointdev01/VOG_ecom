import { INotification } from '../models';

export interface NotificationDto {
  id: string;
  _id: string;
  type: string;
  target: 'buyer' | 'seller' | 'both';
  title: string;
  body: string;
  message: string;
  actionUrl?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  conversationId?: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export function serializeNotification(doc: INotification | Record<string, unknown>): NotificationDto {
  const id = String((doc as INotification)._id || (doc as { id?: string }).id || '');
  const body = String((doc as INotification).body || (doc as INotification).message || '');
  const actionUrl =
    (doc as INotification).actionUrl ||
    (doc as INotification).link ||
    undefined;

  return {
    id,
    _id: id,
    type: String((doc as INotification).type || 'system'),
    target: ((doc as INotification).target || 'buyer') as 'buyer' | 'seller' | 'both',
    title: String((doc as INotification).title || ''),
    body,
    message: String((doc as INotification).message || body),
    actionUrl,
    link: actionUrl,
    entityType: (doc as INotification).entityType,
    entityId: (doc as INotification).entityId
      ? String((doc as INotification).entityId)
      : undefined,
    conversationId: (doc as INotification).conversationId
      ? String((doc as INotification).conversationId)
      : undefined,
    data: ((doc as INotification).data as Record<string, unknown>) || {},
    isRead: Boolean((doc as INotification).isRead),
    createdAt: (doc as INotification).createdAt || new Date(),
    updatedAt: (doc as INotification).updatedAt,
  };
}

export function serializeNotifications(
  docs: Array<INotification | Record<string, unknown>>
): NotificationDto[] {
  return docs.map(serializeNotification);
}
