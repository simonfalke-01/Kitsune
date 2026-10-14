'use client';

import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useEvent } from '../../../event-context';
import { useRealtime } from '../../../realtime-context';
import { useSession } from '../../../session-context';
import {
  Alert,
  AlertDialog,
  Badge,
  Button,
  Dialog,
  DialogTrigger,
  EmptyState,
  Form,
  Link,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TextArea,
  TextField,
  showToast
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api/client';
import {
  formatNotificationTimestamp,
  notificationContent,
  notificationPriority,
  notificationStatus,
  safeNotificationHref,
  type Announcement
} from '@/lib/notifications';

const announcementSchema = z
  .object({
    body: z.string().trim().max(4000, 'Use no more than 4000 characters.'),
    expiresAt: z.string(),
    href: z.string().trim(),
    priority: z.number().int().min(0).max(2),
    scope: z.string().min(1),
    title: z.string().trim().min(1, 'Enter a title.').max(120, 'Use no more than 120 characters.')
  })
  .superRefine((values, context) => {
    if (values.href && !safeNotificationHref(values.href)) {
      context.addIssue({
        code: 'custom',
        message: 'Use an internal path or an HTTP or HTTPS URL.',
        path: ['href']
      });
    }

    if (values.expiresAt) {
      const expiry = new Date(values.expiresAt);

      if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
        context.addIssue({
          code: 'custom',
          message: 'Choose a future expiry.',
          path: ['expiresAt']
        });
      }
    }
  });

type AnnouncementValues = z.infer<typeof announcementSchema>;

const priorityOptions = [
  {
    description: 'Routine event information',
    id: 0,
    label: 'Standard'
  },
  {
    description: 'Time-sensitive update',
    id: 1,
    label: 'Important'
  },
  {
    description: 'Immediate player attention',
    id: 2,
    label: 'Urgent'
  }
] as const;

function AnnouncementLoading() {
  return (
    <div aria-label="Loading announcements" className="grid gap-4" role="status">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function CreateAnnouncementDialog({
  onCreated
}: {
  onCreated: (announcement: Announcement) => void;
}) {
  const { events } = useEvent();
  const { session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    clearErrors,
    control,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors }
  } = useForm<AnnouncementValues>({
    defaultValues: {
      body: '',
      expiresAt: '',
      href: '',
      priority: 1,
      scope: 'organization',
      title: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setError(null);
    const parsed = announcementSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (
          field === 'body' ||
          field === 'expiresAt' ||
          field === 'href' ||
          field === 'priority' ||
          field === 'scope' ||
          field === 'title'
        ) {
          setFieldError(field, {
            message: issue.message
          });
        }
      }
      return;
    }

    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setIsSubmitting(true);

    try {
      const data: Record<string, string> = {
        title: parsed.data.title
      };

      if (parsed.data.body) {
        data.body = parsed.data.body;
      }
      if (parsed.data.href) {
        data.href = parsed.data.href;
      }

      const result = await api.POST('/api/v1/admin/announcements', {
        body: {
          data,
          event_id: parsed.data.scope === 'organization' ? null : parsed.data.scope,
          expires_at: parsed.data.expiresAt ? new Date(parsed.data.expiresAt).toISOString() : null,
          priority: parsed.data.priority
        },
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The announcement could not be created.'));
        return;
      }

      onCreated(result.data);
      reset();
      setIsOpen(false);
      showToast({
        title: 'Announcement published',
        tone: 'success'
      });
    } catch {
      setError('The announcement could not be created. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);

        if (!open) {
          setError(null);
          reset();
        }
      }}
    >
      <Button>Publish announcement</Button>
      <Dialog
        actions={
          <>
            <Button isDisabled={isSubmitting} slot="close" tone="quiet">
              Cancel
            </Button>
            <Button
              isLoading={isSubmitting}
              onPress={() => {
                void submit();
              }}
            >
              Publish announcement
            </Button>
          </>
        }
        title="Publish announcement"
      >
        <Form
          onSubmit={(event) => {
            void submit(event);
          }}
          validationBehavior="aria"
        >
          <Controller
            control={control}
            name="title"
            render={({ field }) => (
              <TextField
                autoFocus
                errorMessage={errors.title?.message}
                isInvalid={Boolean(errors.title)}
                label="Title"
                name={field.name}
                onBlur={field.onBlur}
                onChange={field.onChange}
                value={field.value}
              />
            )}
          />
          <Controller
            control={control}
            name="body"
            render={({ field }) => (
              <TextArea
                errorMessage={errors.body?.message}
                isInvalid={Boolean(errors.body)}
                label="Message"
                name={field.name}
                onBlur={field.onBlur}
                onChange={field.onChange}
                value={field.value}
              />
            )}
          />
          <Controller
            control={control}
            name="scope"
            render={({ field }) => (
              <Select
                errorMessage={errors.scope?.message}
                isInvalid={Boolean(errors.scope)}
                label="Audience"
                onSelectionChange={(key) => {
                  field.onChange(String(key));
                }}
                options={[
                  {
                    id: 'organization',
                    label: 'All events'
                  },
                  ...events.map((event) => ({
                    id: event.id,
                    label: event.name
                  }))
                ]}
                selectedKey={field.value}
              />
            )}
          />
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Select
                errorMessage={errors.priority?.message}
                isInvalid={Boolean(errors.priority)}
                label="Priority"
                onSelectionChange={(key) => {
                  field.onChange(Number(key));
                }}
                options={priorityOptions}
                selectedKey={field.value}
              />
            )}
          />
          <Controller
            control={control}
            name="href"
            render={({ field }) => (
              <TextField
                description="Optional internal path or HTTP or HTTPS URL."
                errorMessage={errors.href?.message}
                isInvalid={Boolean(errors.href)}
                label="Destination"
                name={field.name}
                onBlur={field.onBlur}
                onChange={field.onChange}
                value={field.value}
              />
            )}
          />
          <Controller
            control={control}
            name="expiresAt"
            render={({ field }) => (
              <TextField
                description="Optional. Times use your current time zone."
                errorMessage={errors.expiresAt?.message}
                isInvalid={Boolean(errors.expiresAt)}
                label="Expires"
                name={field.name}
                onBlur={field.onBlur}
                onChange={field.onChange}
                type="datetime-local"
                value={field.value}
              />
            )}
          />
          {error ? <Alert title={error} tone="danger" /> : null}
        </Form>
      </Dialog>
    </DialogTrigger>
  );
}

function RetractAnnouncement({
  announcement,
  onRetracted
}: {
  announcement: Announcement;
  onRetracted: () => Promise<void>;
}) {
  const { session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const content = notificationContent(announcement.data, 'announcement');

  const retract = async () => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.DELETE('/api/v1/admin/announcements/{notification_id}', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            notification_id: announcement.id
          }
        }
      });

      if (result.error) {
        setError(errorMessage(result.error, 'The announcement could not be retracted.'));
        return;
      }

      await onRetracted();
      setIsOpen(false);
      showToast({
        title: 'Announcement retracted',
        tone: 'success'
      });
    } catch {
      setError('The announcement could not be retracted. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);

        if (!open) {
          setError(null);
        }
      }}
    >
      <Button size="small" tone="danger">
        Retract
      </Button>
      <AlertDialog
        actions={
          <>
            <Button isDisabled={isSubmitting} slot="close" tone="quiet">
              Keep announcement
            </Button>
            <Button
              isLoading={isSubmitting}
              onPress={() => {
                void retract();
              }}
              tone="danger"
            >
              Retract
            </Button>
          </>
        }
        description="Players will no longer see this announcement. Its organizer history remains."
        title={`Retract ${content.title}?`}
      >
        {error ? <Alert title={error} tone="danger" /> : null}
      </AlertDialog>
    </DialogTrigger>
  );
}

export function AnnouncementAdminView() {
  const { events } = useEvent();
  const { latest } = useRealtime();
  const { can } = useSession();
  const canManageAnnouncements = can('event_manage');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(canManageAnnouncements);
  const eventNames = new Map(events.map((event) => [event.id, event.name]));

  const load = useCallback(async () => {
    if (!canManageAnnouncements) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.GET('/api/v1/admin/announcements', {
        params: {
          query: {
            limit: 100
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'Announcements could not be loaded.'));
        return;
      }

      setAnnouncements(result.data);
    } catch {
      setError('Announcements could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }, [canManageAnnouncements]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [load]);

  useEffect(() => {
    if (
      latest?.event.type !== 'notification.created' &&
      latest?.event.type !== 'notification.retracted'
    ) {
      return;
    }

    const refreshTimer = window.setTimeout(() => {
      void load();
    }, 150);

    return () => {
      window.clearTimeout(refreshTimer);
    };
  }, [latest, load]);

  if (!canManageAnnouncements) {
    return <Alert title="Announcement management is unavailable for this account." tone="danger" />;
  }

  return (
    <div aria-busy={isLoading} className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Badge>{announcements.length} announcements</Badge>
        <CreateAnnouncementDialog
          onCreated={(announcement) => {
            setAnnouncements((current) => [
              announcement,
              ...current.filter((item) => item.id !== announcement.id)
            ]);
          }}
        />
      </div>

      {error ? (
        <Alert
          actions={
            <Button
              isLoading={isLoading}
              onPress={() => {
                void load();
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
      ) : null}

      {isLoading && announcements.length === 0 ? <AnnouncementLoading /> : null}

      {!isLoading && announcements.length === 0 && !error ? (
        <EmptyState
          action={
            <CreateAnnouncementDialog
              onCreated={(announcement) => {
                setAnnouncements([announcement]);
              }}
            />
          }
          description="Publish an event update when players need it."
          title="No announcements"
        />
      ) : null}

      {announcements.length > 0 ? (
        <Table aria-label="Announcement history">
          <TableHeader>
            <TableColumn isRowHeader>Announcement</TableColumn>
            <TableColumn>Audience</TableColumn>
            <TableColumn>Priority</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Published</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {announcements.map((announcement) => {
              const content = notificationContent(announcement.data, 'announcement');
              const priority = notificationPriority(announcement.priority);
              const status = notificationStatus(announcement);
              const statusDetails = {
                active: {
                  label: 'Active',
                  tone: 'success' as const
                },
                expired: {
                  label: 'Expired',
                  tone: 'warning' as const
                },
                retracted: {
                  label: 'Retracted',
                  tone: 'neutral' as const
                }
              }[status];

              return (
                <TableRow id={announcement.id} key={announcement.id}>
                  <TableCell>
                    <div className="grid max-w-prose gap-1">
                      <span className="font-medium">{content.title}</span>
                      {content.body ? (
                        <span className="line-clamp-2 text-text-muted">{content.body}</span>
                      ) : null}
                      {content.href ? <Link href={content.href}>{content.linkLabel}</Link> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {announcement.event_id
                      ? (eventNames.get(announcement.event_id) ?? 'Unavailable event')
                      : 'All events'}
                  </TableCell>
                  <TableCell>
                    <Badge tone={priority.tone}>{priority.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="grid gap-1">
                      <Badge tone={statusDetails.tone}>{statusDetails.label}</Badge>
                      {announcement.expires_at && status !== 'retracted' ? (
                        <span className="text-xs text-text-muted">
                          Expires {formatNotificationTimestamp(announcement.expires_at)}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{formatNotificationTimestamp(announcement.created_at)}</TableCell>
                  <TableCell>
                    {status !== 'retracted' ? (
                      <RetractAnnouncement announcement={announcement} onRetracted={load} />
                    ) : (
                      <span className="text-sm text-text-subtle">Retracted</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
