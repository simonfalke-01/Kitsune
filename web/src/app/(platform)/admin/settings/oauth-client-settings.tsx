'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { useEvent } from '../../../event-context';
import { useSession } from '../../../session-context';
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
  canonicalScopeOptions,
  oauthClientSchemaFor,
  type OAuthClientValues
} from '@/lib/admin-settings';
import { api, errorMessage, type CreatedOAuthClient, type OAuthClient } from '@/lib/api/client';

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Never';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function CreateOAuthClientForm({ onCreated }: { onCreated: (client: CreatedOAuthClient) => void }) {
  const { events } = useEvent();
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const permissionOptions = canonicalScopeOptions(session?.permissions ?? []);
  const schema = oauthClientSchemaFor(permissionOptions);
  const {
    clearErrors,
    control,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors }
  } = useForm<OAuthClientValues>({
    defaultValues: {
      event_ids: [],
      name: '',
      scopes: permissionOptions.includes('event_read')
        ? ['event_read']
        : permissionOptions.slice(0, 1)
    }
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setError(null);
    const parsed = schema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (field === 'name' || field === 'scopes' || field === 'event_ids') {
          setFieldError(field, { message: issue.message });
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
      const result = await api.POST('/api/v1/auth/oauth-clients', {
        body: parsed.data,
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The OAuth client could not be created.'));
        return;
      }

      reset();
      onCreated(result.data);
      showToast({
        title: 'OAuth client created',
        tone: 'success'
      });
    } catch {
      setError('The OAuth client could not be created. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <Form
      onSubmit={(event) => {
        void submit(event);
      }}
      validationBehavior="aria"
    >
      <Alert
        description="These clients use the client credentials grant. Redirect URLs are not part of this API."
        title="Machine-to-machine access"
      />
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField
            autoComplete="off"
            autoFocus
            errorMessage={errors.name?.message}
            isInvalid={Boolean(errors.name)}
            label="Client name"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="scopes"
        render={({ field }) => (
          <fieldset className="grid gap-3 rounded-lg border border-border-subtle p-4">
            <legend className="px-2 text-sm font-semibold text-text">Scopes</legend>
            {permissionOptions.length === 0 ? (
              <Alert
                title="This account has no permissions available to delegate."
                tone="warning"
              />
            ) : (
              <div className="grid max-h-24 gap-2 overflow-y-auto sm:grid-cols-2">
                {permissionOptions.map((permission) => (
                  <Checkbox
                    isSelected={field.value.includes(permission)}
                    key={permission}
                    onChange={(selected) => {
                      field.onChange(
                        selected
                          ? [...field.value, permission]
                          : field.value.filter((value) => value !== permission)
                      );
                    }}
                  >
                    {permission}
                  </Checkbox>
                ))}
              </div>
            )}
            {errors.scopes?.message ? (
              <p className="m-0 text-sm text-danger-text">{errors.scopes.message}</p>
            ) : null}
          </fieldset>
        )}
      />
      <Controller
        control={control}
        name="event_ids"
        render={({ field }) => (
          <fieldset className="grid gap-3 rounded-lg border border-border-subtle p-4">
            <legend className="px-2 text-sm font-semibold text-text">Event access</legend>
            <p className="m-0 text-sm text-text-muted">
              Leave every event clear for organization-wide access.
            </p>
            {events.length === 0 ? (
              <p className="m-0 text-sm text-text-muted">No events are available.</p>
            ) : (
              <div className="grid max-h-24 gap-2 overflow-y-auto sm:grid-cols-2">
                {events.map((event) => (
                  <Checkbox
                    isSelected={field.value.includes(event.id)}
                    key={event.id}
                    onChange={(selected) => {
                      field.onChange(
                        selected
                          ? [...field.value, event.id]
                          : field.value.filter((value) => value !== event.id)
                      );
                    }}
                  >
                    {event.name}
                  </Checkbox>
                ))}
              </div>
            )}
            {errors.event_ids?.message ? (
              <p className="m-0 text-sm text-danger-text">{errors.event_ids.message}</p>
            ) : null}
          </fieldset>
        )}
      />
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isDisabled={permissionOptions.length === 0} isLoading={isSubmitting} type="submit">
        Create OAuth client
      </Button>
    </Form>
  );
}

function OAuthClientRevocation({
  client,
  isLoading,
  onRevoke
}: {
  client: OAuthClient;
  isLoading: boolean;
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
              Keep client
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
              Revoke client
            </Button>
          </>
        }
        description={`${client.name} will immediately lose access. Issued access tokens remain valid until they expire.`}
        title="Revoke OAuth client?"
      />
    </DialogTrigger>
  );
}

export function OAuthClientSettings({ initialClients }: { initialClients: OAuthClient[] }) {
  const { session } = useSession();
  const [clients, setClients] = useState(initialClients);
  const [createdClient, setCreatedClient] = useState<CreatedOAuthClient | null>(null);
  const [secretAcknowledged, setSecretAcknowledged] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const revoke = async (client: OAuthClient): Promise<boolean> => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return false;
    }

    setPendingAction(client.id);
    setError(null);

    try {
      const result = await api.DELETE('/api/v1/auth/oauth-clients/{client_id}', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            client_id: client.id
          }
        }
      });

      if (!result.response.ok) {
        setError(errorMessage(result.error, 'The OAuth client could not be revoked.'));
        return false;
      }

      setClients((current) =>
        current.map((item) =>
          item.id === client.id
            ? {
                ...item,
                revoked_at: new Date().toISOString()
              }
            : item
        )
      );
      showToast({
        title: 'OAuth client revoked',
        tone: 'success'
      });
      return true;
    } catch {
      setError('The OAuth client could not be revoked. Check your connection and retry.');
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section
      aria-busy={pendingAction !== null}
      className="grid gap-6"
      aria-labelledby="oauth-clients-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2
            className="m-0 font-display text-xl font-semibold tracking-tight text-text"
            id="oauth-clients-title"
          >
            OAuth clients
          </h2>
          <Badge>{clients.length}</Badge>
        </div>
        <DialogTrigger isOpen={createOpen} onOpenChange={setCreateOpen}>
          <Button isDisabled={createdClient !== null}>Create client</Button>
          <Dialog
            description="Choose the smallest permission and event ceiling the integration needs."
            title="Create OAuth client"
          >
            <CreateOAuthClientForm
              onCreated={(client) => {
                setClients((current) => [client, ...current]);
                setCreatedClient(client);
                setSecretAcknowledged(false);
                setCreateOpen(false);
              }}
            />
          </Dialog>
        </DialogTrigger>
      </div>

      {createdClient ? (
        <div className="grid gap-4 rounded-lg border border-warning-border bg-warning-subtle p-4">
          <Alert
            description="The secret cannot be retrieved after you dismiss this notice."
            title="Save these credentials now"
            tone="warning"
          />
          <CodeBlock
            code={`client_id=${createdClient.client_id}\nclient_secret=${createdClient.client_secret}`}
            label="OAuth client credentials"
          />
          <Checkbox isSelected={secretAcknowledged} onChange={setSecretAcknowledged}>
            I copied the client ID and secret to secure storage.
          </Checkbox>
          <div>
            <Button
              isDisabled={!secretAcknowledged}
              onPress={() => {
                setCreatedClient(null);
                setSecretAcknowledged(false);
              }}
              size="small"
              tone="secondary"
            >
              Dismiss credentials
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <Alert title={error} tone="danger" /> : null}

      {clients.length === 0 ? (
        <EmptyState
          description="Create a confidential client for a trusted service integration."
          title="No OAuth clients"
        />
      ) : (
        <Table aria-label="OAuth clients">
          <TableHeader>
            <TableColumn isRowHeader>Client</TableColumn>
            <TableColumn>Scopes</TableColumn>
            <TableColumn>Events</TableColumn>
            <TableColumn>Last used</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody emptyState="No OAuth clients.">
            {clients.map((client) => (
              <TableRow id={client.id} key={client.id}>
                <TableCell>
                  <span className="grid gap-1">
                    <span className="font-medium text-text">{client.name}</span>
                    <span className="font-mono text-xs text-text-muted">{client.client_id}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-text-muted">{client.scopes.join(', ')}</span>
                </TableCell>
                <TableCell>
                  {client.event_ids.length === 0 ? 'Organization' : client.event_ids.length}
                </TableCell>
                <TableCell>{formatTimestamp(client.last_used_at)}</TableCell>
                <TableCell>
                  <Badge tone={client.revoked_at ? 'danger' : 'success'}>
                    {client.revoked_at ? 'Revoked' : 'Active'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {client.revoked_at ? (
                    <span className="text-sm text-text-muted">
                      {formatTimestamp(client.revoked_at)}
                    </span>
                  ) : (
                    <OAuthClientRevocation
                      client={client}
                      isLoading={pendingAction === client.id}
                      onRevoke={() => revoke(client)}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
