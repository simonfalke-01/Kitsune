'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useSession } from '../../session-context';
import { MfaPanel } from './mfa-panel';
import { TokenPanel } from './token-panel';
import {
  Alert,
  AlertDialog,
  Badge,
  Button,
  Dialog,
  DialogTrigger,
  EmptyState,
  Form,
  StatusIndicator,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TextField,
  showToast
} from '@/components/ui';
import {
  api,
  errorMessage,
  type ApiTokenSummary,
  type PasskeySummary,
  type SessionSummary
} from '@/lib/api/client';
import { createPasskey } from '@/lib/auth/passkeys';

interface AccountViewProps {
  initialError: string | null;
  initialPasskeys: PasskeySummary[];
  initialSessions: SessionSummary[];
  initialTokens: ApiTokenSummary[];
}

const passkeySchema = z.object({
  name: z.string().trim().min(1, 'Enter a device name.').max(80, 'Use no more than 80 characters.')
});

type PasskeyValues = z.infer<typeof passkeySchema>;

const timestampFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC'
});

function formatTimestamp(value: string): string {
  return `${timestampFormatter.format(new Date(value))} UTC`;
}

function SecurityConfirmation({
  buttonLabel,
  description,
  isLoading,
  onConfirm,
  title
}: {
  buttonLabel: string;
  description: string;
  isLoading: boolean;
  onConfirm: () => Promise<boolean>;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button isDisabled={isLoading} size="small" tone="danger">
        {buttonLabel}
      </Button>
      <AlertDialog
        actions={
          <>
            <Button isDisabled={isLoading} slot="close" tone="quiet">
              Cancel
            </Button>
            <Button
              isLoading={isLoading}
              onPress={() => {
                void onConfirm().then((completed) => {
                  if (completed) {
                    setIsOpen(false);
                  }
                });
              }}
              tone="danger"
            >
              {buttonLabel}
            </Button>
          </>
        }
        description={description}
        title={title}
      />
    </DialogTrigger>
  );
}

function PasskeyForm({
  isLoading,
  onDone,
  onEnroll
}: {
  isLoading: boolean;
  onDone: () => void;
  onEnroll: (name: string) => Promise<string | null>;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    clearErrors,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors }
  } = useForm<PasskeyValues>({
    defaultValues: {
      name: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setSubmitError(null);
    const parsed = passkeySchema.safeParse(values);

    if (!parsed.success) {
      setError('name', {
        message: parsed.error.issues[0]?.message
      });
      return;
    }

    const mutationError = await onEnroll(parsed.data.name.trim());

    if (mutationError) {
      setSubmitError(mutationError);
      return;
    }

    reset();
    onDone();
  });

  return (
    <Form
      onSubmit={(event) => {
        void submit(event);
      }}
      validationBehavior="aria"
    >
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField
            autoComplete="off"
            autoFocus
            description="Use a name you will recognize later."
            errorMessage={errors.name?.message}
            isInvalid={Boolean(errors.name)}
            label="Device name"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      {submitError ? <Alert title={submitError} tone="danger" /> : null}
      <Button isLoading={isLoading} type="submit">
        Add passkey
      </Button>
    </Form>
  );
}

export function AccountView({
  initialError,
  initialPasskeys,
  initialSessions,
  initialTokens
}: AccountViewProps) {
  const { session } = useSession();
  const [sessions, setSessions] = useState(initialSessions);
  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [error, setError] = useState(initialError);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [passkeyOpen, setPasskeyOpen] = useState(false);

  const reload = async () => {
    setPendingAction('refresh');
    setError(null);

    try {
      const [sessionResult, passkeyResult] = await Promise.all([
        api.GET('/api/v1/auth/sessions'),
        api.GET('/api/v1/auth/passkeys')
      ]);

      if (!sessionResult.data || !passkeyResult.data) {
        setError(
          errorMessage(
            sessionResult.error ?? passkeyResult.error,
            'Security settings could not be loaded.'
          )
        );
        return;
      }

      setSessions(sessionResult.data);
      setPasskeys(passkeyResult.data);
    } catch {
      setError('Security settings could not be loaded. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  const enrollPasskey = async (name: string): Promise<string | null> => {
    if (!session?.csrf_token) {
      return 'The session could not authorize this action.';
    }

    setPendingAction('passkey:add');

    try {
      const startResult = await api.POST('/api/v1/auth/passkeys/register/start', {
        body: {
          name
        },
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!startResult.data) {
        return errorMessage(startResult.error, 'Passkey setup could not start.');
      }

      const credential = await createPasskey(startResult.data.options);
      const finishResult = await api.POST('/api/v1/auth/passkeys/register/finish', {
        body: {
          credential
        },
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!finishResult.data) {
        return errorMessage(finishResult.error, 'The passkey could not be added.');
      }

      setPasskeys((current) => [finishResult.data, ...current]);
      showToast({
        title: 'Passkey added',
        tone: 'success'
      });
      return null;
    } catch (caught) {
      return caught instanceof Error
        ? caught.message
        : 'The passkey could not be added. Check your connection and retry.';
    } finally {
      setPendingAction(null);
    }
  };

  const revokePasskey = async (credentialId: string): Promise<boolean> => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return false;
    }

    setPendingAction(`passkey:${credentialId}`);
    setError(null);

    try {
      const result = await api.DELETE('/api/v1/auth/passkeys/{credential_id}', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            credential_id: credentialId
          }
        }
      });

      if (!result.response.ok) {
        setError(errorMessage(result.error, 'The passkey could not be removed.'));
        return false;
      }

      setPasskeys((current) => current.filter((passkey) => passkey.id !== credentialId));
      showToast({
        title: 'Passkey removed',
        tone: 'success'
      });
      return true;
    } catch {
      setError('The passkey could not be removed. Check your connection and retry.');
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  const revokeSession = async (sessionId: string): Promise<boolean> => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return false;
    }

    setPendingAction(`session:${sessionId}`);
    setError(null);

    try {
      const result = await api.DELETE('/api/v1/auth/sessions/{session_id}', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            session_id: sessionId
          }
        }
      });

      if (!result.response.ok) {
        setError(errorMessage(result.error, 'The session could not be revoked.'));
        return false;
      }

      setSessions((current) => current.filter((item) => item.id !== sessionId));
      showToast({
        title: 'Session revoked',
        tone: 'success'
      });
      return true;
    } catch {
      setError('The session could not be revoked. Check your connection and retry.');
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  if (!session) {
    return <Alert title="The account session is unavailable." tone="danger" />;
  }

  return (
    <div aria-busy={pendingAction !== null} className="grid gap-8">
      <section
        aria-label="Account security status"
        className="border-l-2 border-accent bg-surface-raised px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-1">
            <strong className="text-sm font-semibold text-text">{session.user.display_name}</strong>
            <span className="text-xs text-text-muted">{session.user.email}</span>
          </div>
          <StatusIndicator
            label={session.user.email_verified ? 'Email verified' : 'Email unverified'}
            tone={session.user.email_verified ? 'success' : 'warning'}
          />
        </div>
      </section>

      {error ? (
        <Alert
          actions={
            <Button
              isLoading={pendingAction === 'refresh'}
              onPress={() => {
                void reload();
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

      <section className="grid gap-4" aria-labelledby="sessions-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2
            className="m-0 font-display text-xl font-semibold tracking-tight text-text"
            id="sessions-title"
          >
            Sessions
          </h2>
          <Badge>{sessions.length} active</Badge>
        </div>
        <Table aria-label="Active sessions">
          <TableHeader>
            <TableColumn isRowHeader>Session</TableColumn>
            <TableColumn>Last active</TableColumn>
            <TableColumn>Expires</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody emptyState="No active sessions.">
            {sessions.map((item) => (
              <TableRow id={item.id} key={item.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-text-muted">{item.id.slice(0, 8)}</span>
                    {item.current ? <Badge tone="accent">Current</Badge> : null}
                  </span>
                </TableCell>
                <TableCell>
                  <time dateTime={item.last_seen_at}>{formatTimestamp(item.last_seen_at)}</time>
                </TableCell>
                <TableCell>
                  <time dateTime={item.expires_at}>{formatTimestamp(item.expires_at)}</time>
                </TableCell>
                <TableCell>
                  {item.current ? (
                    <span className="sr-only">Current session cannot be revoked here</span>
                  ) : (
                    <SecurityConfirmation
                      buttonLabel="Revoke"
                      description="This device must sign in again before it can access Kitsune."
                      isLoading={pendingAction === `session:${item.id}`}
                      onConfirm={() => revokeSession(item.id)}
                      title="Revoke this session?"
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="grid gap-4" aria-labelledby="passkeys-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2
            className="m-0 font-display text-xl font-semibold tracking-tight text-text"
            id="passkeys-title"
          >
            Passkeys
          </h2>
          <DialogTrigger isOpen={passkeyOpen} onOpenChange={setPasskeyOpen}>
            <Button size="small">Add passkey</Button>
            <Dialog
              description="Your browser or security key will ask you to confirm."
              title="Add passkey"
            >
              <PasskeyForm
                isLoading={pendingAction === 'passkey:add'}
                onDone={() => {
                  setPasskeyOpen(false);
                }}
                onEnroll={enrollPasskey}
              />
            </Dialog>
          </DialogTrigger>
        </div>
        {passkeys.length === 0 ? (
          <EmptyState
            action={
              <Button
                onPress={() => {
                  setPasskeyOpen(true);
                }}
                tone="secondary"
              >
                Add passkey
              </Button>
            }
            description="Add a passkey for passwordless sign-in."
            title="No passkeys"
          />
        ) : (
          <Table aria-label="Account passkeys">
            <TableHeader>
              <TableColumn isRowHeader>Passkey</TableColumn>
              <TableColumn>Last used</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody emptyState="No passkeys.">
              {passkeys.map((passkey) => (
                <TableRow id={passkey.id} key={passkey.id}>
                  <TableCell>
                    <span className="font-medium text-text">{passkey.name}</span>
                  </TableCell>
                  <TableCell>
                    {passkey.last_used_at ? (
                      <time dateTime={passkey.last_used_at}>
                        {formatTimestamp(passkey.last_used_at)}
                      </time>
                    ) : (
                      <span className="text-text-muted">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <SecurityConfirmation
                      buttonLabel="Remove"
                      description="This passkey stops working immediately."
                      isLoading={pendingAction === `passkey:${passkey.id}`}
                      onConfirm={() => revokePasskey(passkey.id)}
                      title={`Remove ${passkey.name}?`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <MfaPanel />
      <TokenPanel initialTokens={initialTokens} />
    </div>
  );
}
