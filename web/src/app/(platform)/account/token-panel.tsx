'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useSession } from '../../session-context';
import {
  Alert,
  AlertDialog,
  Badge,
  Button,
  Checkbox,
  CodeBlock,
  Dialog,
  DialogTrigger,
  EmptyState,
  Form,
  NumberField,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TextField,
  showToast
} from '@/components/ui';
import { api, errorMessage, type ApiTokenSummary } from '@/lib/api/client';

interface TokenPanelProps {
  initialTokens: ApiTokenSummary[];
}

const tokenSchema = z.object({
  expires_in_days: z
    .number()
    .int()
    .min(1, 'Use at least 1 day.')
    .max(365, 'Use no more than 365 days.'),
  name: z.string().trim().min(1, 'Enter a token name.').max(80, 'Use no more than 80 characters.')
});

type TokenValues = z.infer<typeof tokenSchema>;

function tokenExpiry(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeZone: 'UTC'
  }).format(new Date(value));
}

export function TokenPanel({ initialTokens }: TokenPanelProps) {
  const { session } = useSession();
  const [tokens, setTokens] = useState(initialTokens);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(
    session?.permissions.includes('event_read')
      ? ['event_read']
      : (session?.permissions.slice(0, 1) ?? [])
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const {
    clearErrors,
    control,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors }
  } = useForm<TokenValues>({
    defaultValues: {
      expires_in_days: 30,
      name: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setError(null);
    const parsed = tokenSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (field === 'name' || field === 'expires_in_days') {
          setFieldError(field, {
            message: issue.message
          });
        }
      }
      return;
    }

    if (selectedScopes.length === 0) {
      setError('Choose at least one permission.');
      return;
    }

    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setPendingAction('create');

    try {
      const result = await api.POST('/api/v1/auth/tokens', {
        body: {
          event_ids: [],
          expires_in_days: parsed.data.expires_in_days,
          name: parsed.data.name.trim(),
          scopes: selectedScopes
        },
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The API token could not be created.'));
        return;
      }

      setTokens((current) => [result.data, ...current]);
      setCreatedToken(result.data.token);
      reset();
      setCreateOpen(false);
      showToast({
        title: 'API token created',
        tone: 'success'
      });
    } catch {
      setError('The API token could not be created. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  });

  const revoke = async (tokenId: string): Promise<boolean> => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return false;
    }

    setPendingAction(tokenId);
    setError(null);

    try {
      const result = await api.DELETE('/api/v1/auth/tokens/{token_id}', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            token_id: tokenId
          }
        }
      });

      if (!result.response.ok) {
        setError(errorMessage(result.error, 'The API token could not be revoked.'));
        return false;
      }

      setTokens((current) => current.filter((token) => token.id !== tokenId));
      showToast({
        title: 'API token revoked',
        tone: 'success'
      });
      return true;
    } catch {
      setError('The API token could not be revoked. Check your connection and retry.');
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section
      aria-busy={pendingAction !== null}
      className="grid gap-4"
      aria-labelledby="tokens-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2
            className="m-0 font-display text-xl font-semibold tracking-tight text-text"
            id="tokens-title"
          >
            API tokens
          </h2>
          <Badge>{tokens.length} active</Badge>
        </div>
        <DialogTrigger isOpen={createOpen} onOpenChange={setCreateOpen}>
          <Button size="small">Create token</Button>
          <Dialog
            description="The token value is shown once after creation."
            title="Create API token"
          >
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
                    errorMessage={errors.name?.message}
                    isInvalid={Boolean(errors.name)}
                    label="Token name"
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
              />
              <Controller
                control={control}
                name="expires_in_days"
                render={({ field }) => (
                  <NumberField
                    errorMessage={errors.expires_in_days?.message}
                    isInvalid={Boolean(errors.expires_in_days)}
                    label="Lifetime in days"
                    maxValue={365}
                    minValue={1}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
              />
              <fieldset className="grid gap-3 rounded-lg border border-border-subtle p-4">
                <legend className="px-2 text-sm font-semibold text-text">Permissions</legend>
                <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                  {session?.permissions.map((permission) => (
                    <Checkbox
                      isSelected={selectedScopes.includes(permission)}
                      key={permission}
                      onChange={(selected) => {
                        setSelectedScopes((current) =>
                          selected
                            ? [...current, permission]
                            : current.filter((scope) => scope !== permission)
                        );
                      }}
                    >
                      {permission}
                    </Checkbox>
                  ))}
                </div>
              </fieldset>
              {error ? <Alert title={error} tone="danger" /> : null}
              <Button isLoading={pendingAction === 'create'} type="submit">
                Create token
              </Button>
            </Form>
          </Dialog>
        </DialogTrigger>
      </div>

      {createdToken ? (
        <div className="grid gap-3">
          <Alert
            description="Copy it now. The token cannot be retrieved after leaving this page."
            title="API token ready"
            tone="success"
          />
          <CodeBlock code={createdToken} label="API token" />
        </div>
      ) : null}

      {error && !createOpen ? <Alert title={error} tone="danger" /> : null}

      {tokens.length === 0 ? (
        <EmptyState
          description="Create a scoped token for CLI or automation access."
          title="No API tokens"
        />
      ) : (
        <Table aria-label="API tokens">
          <TableHeader>
            <TableColumn isRowHeader>Token</TableColumn>
            <TableColumn>Scopes</TableColumn>
            <TableColumn>Expires</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody emptyState="No API tokens.">
            {tokens.map((token) => (
              <TableRow id={token.id} key={token.id}>
                <TableCell>
                  <span className="font-medium text-text">{token.name}</span>
                </TableCell>
                <TableCell>{token.scopes.length}</TableCell>
                <TableCell>
                  <time dateTime={token.expires_at}>{tokenExpiry(token.expires_at)}</time>
                </TableCell>
                <TableCell>
                  <TokenRevocation
                    isLoading={pendingAction === token.id}
                    name={token.name}
                    onRevoke={() => revoke(token.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function TokenRevocation({
  isLoading,
  name,
  onRevoke
}: {
  isLoading: boolean;
  name: string;
  onRevoke: () => Promise<boolean>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button isDisabled={isLoading} size="small" tone="danger">
        Revoke
      </Button>
      <AlertDialog
        actions={
          <>
            <Button isDisabled={isLoading} slot="close" tone="quiet">
              Keep token
            </Button>
            <Button
              isLoading={isLoading}
              onPress={() => {
                void onRevoke().then((revoked) => {
                  if (revoked) {
                    setIsOpen(false);
                  }
                });
              }}
              tone="danger"
            >
              Revoke
            </Button>
          </>
        }
        description="Requests using this token stop working immediately."
        title={`Revoke ${name}?`}
      />
    </DialogTrigger>
  );
}
