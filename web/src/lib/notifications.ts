import type { components } from './api/schema';

export type Notification = components['schemas']['NotificationResponse'];
export type NotificationPage = components['schemas']['NotificationPageResponse'];
export type Announcement = components['schemas']['AnnouncementResponse'];
export type CreateAnnouncementInput = components['schemas']['CreateAnnouncementRequest'];

export interface NotificationContent {
  body: string | null;
  href: string | null;
  linkLabel: string;
  title: string;
}

export type NotificationPriority = 0 | 1 | 2;

export interface NotificationPriorityDetails {
  label: string;
  tone: 'danger' | 'neutral' | 'warning';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function titleFromTemplate(template: string): string {
  const words = template
    .split(/[._-]+/u)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return 'Notification';
  }

  const title = words.join(' ');
  return `${title.charAt(0).toUpperCase()}${title.slice(1)}`;
}

export function safeNotificationHref(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const href = value.trim();

  if (!href) {
    return null;
  }

  if (href.startsWith('/') && !href.startsWith('//')) {
    return href;
  }

  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function notificationContent(data: unknown, template = 'notification'): NotificationContent {
  const record = isRecord(data) ? data : {};
  const href = safeNotificationHref(
    stringValue(record, ['href', 'url', 'link', 'action_url', 'actionUrl'])
  );

  return {
    body: stringValue(record, ['body', 'message', 'description']),
    href,
    linkLabel:
      stringValue(record, ['link_label', 'linkLabel', 'action_label', 'actionLabel']) ??
      'View details',
    title: stringValue(record, ['title', 'heading', 'subject']) ?? titleFromTemplate(template)
  };
}

export function notificationPriority(priority: number): NotificationPriorityDetails {
  if (priority >= 2) {
    return {
      label: 'Urgent',
      tone: 'danger'
    };
  }

  if (priority === 1) {
    return {
      label: 'Important',
      tone: 'warning'
    };
  }

  return {
    label: 'Standard',
    tone: 'neutral'
  };
}

export function notificationStatus(
  announcement: Pick<Announcement, 'expires_at' | 'retracted_at'>,
  now = Date.now()
): 'active' | 'expired' | 'retracted' {
  if (announcement.retracted_at) {
    return 'retracted';
  }

  if (announcement.expires_at && new Date(announcement.expires_at).getTime() <= now) {
    return 'expired';
  }

  return 'active';
}

export function formatNotificationTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export function formatUnreadCount(count: number): string {
  return count > 99 ? '99+' : String(Math.max(0, count));
}
