'use client';

import { Bell } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useRealtime } from '@/app/realtime-context';
import { useSession } from '@/app/session-context';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Link,
  Sheet,
  SheetTrigger,
  Skeleton,
  showToast
} from '@/components/ui';
import { cx } from '@/components/ui/styles';
import { api, errorMessage } from '@/lib/api/client';
import {
  formatNotificationTimestamp,
  formatUnreadCount,
  notificationContent,
  notificationPriority,
  type Notification,
  type NotificationPage
} from '@/lib/notifications';

const pageSize = 25;

function NotificationLoading() {
  return (
    <div aria-label="Loading notifications" className="grid gap-4 p-6" role="status">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="grid gap-2" key={index}>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function NotificationItem({
  isPending,
  notification,
  onMarkRead
}: {
  isPending: boolean;
  notification: Notification;
  onMarkRead: (notification: Notification) => Promise<void>;
}) {
  const content = notificationContent(notification.data, notification.template);
  const priority = notificationPriority(notification.priority);
  const isUnread = !notification.read_at;

  return (
    <article
      className={cx(
        'grid gap-3 border-b border-border-subtle p-6 last:border-b-0',
        isUnread ? 'bg-accent-subtle' : 'bg-surface-raised'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-base font-semibold text-text">{content.title}</h3>
            {isUnread ? (
              <>
                <span aria-hidden className="size-2 rounded-full bg-accent" />
                <span className="sr-only">Unread</span>
              </>
            ) : null}
          </div>
          <p className="m-0 text-xs text-text-muted">
            {formatNotificationTimestamp(notification.created_at)}
          </p>
        </div>
        {notification.priority > 0 ? <Badge tone={priority.tone}>{priority.label}</Badge> : null}
      </div>
      {content.body ? <p className="m-0 text-sm text-text-muted">{content.body}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {content.href ? (
          <Link
            href={content.href}
            onPress={() => {
              if (isUnread) {
                void onMarkRead(notification);
              }
            }}
          >
            {content.linkLabel}
          </Link>
        ) : (
          <span />
        )}
        {isUnread ? (
          <Button
            isLoading={isPending}
            onPress={() => {
              void onMarkRead(notification);
            }}
            size="small"
            tone="quiet"
          >
            Mark read
          </Button>
        ) : (
          <span className="text-xs text-text-subtle">Read</span>
        )}
      </div>
    </article>
  );
}

export function NotificationCenter() {
  const { latest } = useRealtime();
  const { can, session } = useSession();
  const canReadNotifications = can('event_read');
  const [items, setItems] = useState<Notification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(canReadNotifications);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [pendingNotificationId, setPendingNotificationId] = useState<string | null>(null);

  const loadPage = useCallback(async (cursor?: string): Promise<NotificationPage | null> => {
    const result = await api.GET('/api/v1/notifications', {
      params: {
        query: {
          cursor,
          limit: pageSize
        }
      }
    });

    if (!result.data) {
      setError(errorMessage(result.error, 'Notifications could not be loaded.'));
      return null;
    }

    return result.data;
  }, []);

  const refresh = useCallback(async () => {
    if (!canReadNotifications) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const page = await loadPage();

      if (page) {
        setItems(page.items);
        setNextCursor(page.next_cursor ?? null);
        setUnreadCount(page.unread_count);
      }
    } catch {
      setError('Notifications could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }, [canReadNotifications, loadPage]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [refresh]);

  useEffect(() => {
    if (
      latest?.event.type !== 'notification.created' &&
      latest?.event.type !== 'notification.retracted'
    ) {
      return;
    }

    const refreshTimer = window.setTimeout(() => {
      void refresh();
    }, 150);

    return () => {
      window.clearTimeout(refreshTimer);
    };
  }, [latest, refresh]);

  const loadMore = async () => {
    if (!nextCursor) {
      return;
    }

    setIsLoadingMore(true);
    setError(null);

    try {
      const page = await loadPage(nextCursor);

      if (page) {
        setItems((current) => {
          const known = new Set(current.map((item) => item.id));
          return [...current, ...page.items.filter((item) => !known.has(item.id))];
        });
        setNextCursor(page.next_cursor ?? null);
        setUnreadCount(page.unread_count);
      }
    } catch {
      setError('More notifications could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const markRead = async (notification: Notification) => {
    if (notification.read_at) {
      return;
    }

    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setPendingNotificationId(notification.id);
    setError(null);

    try {
      const result = await api.POST('/api/v1/notifications/{notification_id}/read', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            notification_id: notification.id
          }
        }
      });

      if (result.error) {
        setError(errorMessage(result.error, 'The notification could not be marked read.'));
        return;
      }

      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, read_at: readAt } : item))
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch {
      setError('The notification could not be marked read. Check your connection and retry.');
    } finally {
      setPendingNotificationId(null);
    }
  };

  const markAllRead = async () => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setIsMarkingAll(true);
    setError(null);

    try {
      const unread = new Map(
        items.filter((item) => !item.read_at).map((item) => [item.id, item] as const)
      );
      let cursor = nextCursor;

      while (cursor) {
        const page = await loadPage(cursor);

        if (!page) {
          return;
        }

        for (const item of page.items) {
          if (!item.read_at) {
            unread.set(item.id, item);
          }
        }

        cursor = page.next_cursor ?? null;
      }

      for (const notification of unread.values()) {
        const result = await api.POST('/api/v1/notifications/{notification_id}/read', {
          headers: {
            'x-csrf-token': session.csrf_token
          },
          params: {
            path: {
              notification_id: notification.id
            }
          }
        });

        if (result.error) {
          setError(errorMessage(result.error, 'Not all notifications could be marked read.'));
          await refresh();
          return;
        }
      }

      await refresh();
      showToast({
        title: 'Notifications marked read',
        tone: 'success'
      });
    } catch {
      setError('Not all notifications could be marked read. Check your connection and retry.');
      await refresh();
    } finally {
      setIsMarkingAll(false);
    }
  };

  if (!canReadNotifications) {
    return null;
  }

  const buttonLabel = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <SheetTrigger>
      <Button aria-label={buttonLabel} className="relative" size="icon" tone="quiet">
        <Bell aria-hidden className="size-4" />
        {unreadCount > 0 ? (
          <span
            aria-hidden
            className={cx(
              'absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center',
              'justify-center rounded-sm bg-danger px-1 text-xs font-semibold text-text-on-accent'
            )}
          >
            {formatUnreadCount(unreadCount)}
          </span>
        ) : null}
      </Button>
      <Sheet
        contentClassName="p-0"
        footer={
          unreadCount > 0 ? (
            <Button
              isLoading={isMarkingAll}
              onPress={() => {
                void markAllRead();
              }}
              tone="secondary"
            >
              Mark all read
            </Button>
          ) : null
        }
        title="Notifications"
      >
        {error ? (
          <div className="p-6">
            <Alert
              actions={
                <Button
                  isLoading={isLoading}
                  onPress={() => {
                    void refresh();
                  }}
                  size="small"
                  tone="secondary"
                >
                  Retry
                </Button>
              }
              title={error}
              tone="danger"
            />
          </div>
        ) : null}
        {isLoading && items.length === 0 ? <NotificationLoading /> : null}
        {!isLoading && items.length === 0 && !error ? (
          <div className="p-6">
            <EmptyState
              description="New event updates will appear here."
              title="No notifications"
            />
          </div>
        ) : null}
        {items.length > 0 ? (
          <div aria-busy={isLoading || isLoadingMore}>
            {items.map((notification) => (
              <NotificationItem
                isPending={pendingNotificationId === notification.id}
                key={notification.id}
                notification={notification}
                onMarkRead={markRead}
              />
            ))}
            {nextCursor ? (
              <div className="flex justify-center p-6">
                <Button
                  isLoading={isLoadingMore}
                  onPress={() => {
                    void loadMore();
                  }}
                  tone="secondary"
                >
                  Load earlier
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </SheetTrigger>
  );
}
