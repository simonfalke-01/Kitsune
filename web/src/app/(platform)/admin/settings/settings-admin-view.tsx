'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

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
  api,
  errorMessage,
  type CreatedOAuthClient,
  type OAuthClient,
  type OidcProvider,
  type SamlProvider
} from '@/lib/api/client';

interface SettingsAdminViewProps {
  initialError: string | null;
  initialOAuthClients: OAuthClient[];
  initialOidcProviders: OidcProvider[];
  initialSamlProviders: SamlProvider[];
}

const oauthClientSchema = z.object({
  event_ids: z.array(z.string()),
  name: z.string().trim().min(1, 'Enter a client name.'),
  scopes: z.array(z.string()).min(1)
});

type OAuthClientValues = z.infer<typeof oauthClientSchema>;

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Never';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function CreateOAuthClientForm({
  onCreated
}: {
  onCreated: (client: CreatedOAuthClient) => Promise<void>;
}) {
  const { events } = useEvent();
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<OAuthClientValues>({
    defaultValues: {
      event_ids: [],
      name: '',
      scopes: ['event_read']
    }
  });
  const permissionOptions = [...(session?.permissions ?? [])].sort();

  const submit = handleSubmit(async (values) => {
    const parsed = oauthClientSchema.safeParse(values);

    if (!parsed.success || !session?.csrf_token) {
      setError('Enter a name and choose at least one scope.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

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
      await onCreated(result.data);
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
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField
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
            <div className="grid gap-2 sm:grid-cols-2">
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
          </fieldset>
        )}
      />
      <Controller
        control={control}
        name="event_ids"
        render={({ field }) => (
          <fieldset className="grid gap-3 rounded-lg border border-border-subtle p-4">
            <legend className="px-2 text-sm font-semibold text-text">Event allow-list</legend>
            <p className="m-0 text-sm text-text-muted">
              Leave every event clear for organization-wide access.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
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
          </fieldset>
        )}
      />
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isLoading={isSubmitting} type="submit">
        Create OAuth client
      </Button>
    </Form>
  );
}

export function SettingsAdminView({
  initialError,
  initialOAuthClients,
  initialOidcProviders,
  initialSamlProviders
}: SettingsAdminViewProps) {
  const { can, session } = useSession();
  const [error, setError] = useState(initialError);
  const [oauthClients, setOAuthClients] = useState(initialOAuthClients);
  const [oidcProviders, setOidcProviders] = useState(initialOidcProviders);
  const [samlProviders, setSamlProviders] = useState(initialSamlProviders);
  const [createdClient, setCreatedClient] = useState<CreatedOAuthClient | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [oauthResult, oidcResult, samlResult] = await Promise.all([
        api.GET('/api/v1/auth/oauth-clients'),
        api.GET('/api/v1/auth/oidc/providers'),
        api.GET('/api/v1/auth/saml/providers')
      ]);

      if (!oauthResult.data || !oidcResult.data || !samlResult.data) {
        setError('Platform settings could not be loaded.');
        return;
      }

      setOAuthClients(oauthResult.data);
      setOidcProviders(oidcResult.data);
      setSamlProviders(samlResult.data);
    } catch {
      setError('Platform settings could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  };

  const revokeOAuthClient = async (client: OAuthClient) => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
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

      if (result.error) {
        setError(errorMessage(result.error, 'The OAuth client could not be revoked.'));
        return;
      }

      await refresh();
      showToast({
        title: 'OAuth client revoked',
        tone: 'success'
      });
    } catch {
      setError('The OAuth client could not be revoked. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  const setOidcEnabled = async (provider: OidcProvider, enabled: boolean) => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setPendingAction(provider.id);
    setError(null);

    try {
      const result = await api.PUT('/api/v1/auth/oidc/providers/{provider_id}', {
        body: {
          allow_email_link: provider.allow_email_link,
          auto_provision: provider.auto_provision,
          client_id: provider.client_id,
          client_secret: null,
          display_name: provider.display_name,
          enabled,
          issuer_url: provider.issuer_url
        },
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            provider_id: provider.id
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The OpenID provider could not be updated.'));
        return;
      }

      await refresh();
      showToast({
        title: enabled ? 'OpenID provider enabled' : 'OpenID provider disabled',
        tone: 'success'
      });
    } catch {
      setError('The OpenID provider could not be updated. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  const setSamlEnabled = async (provider: SamlProvider, enabled: boolean) => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setPendingAction(provider.id);
    setError(null);

    try {
      const result = await api.PUT('/api/v1/auth/saml/providers/{provider_id}', {
        body: {
          allow_email_link: provider.allow_email_link,
          auto_provision: provider.auto_provision,
          display_name: provider.display_name,
          display_name_attribute: provider.display_name_attribute,
          email_attribute: provider.email_attribute,
          enabled,
          metadata_signing_certificate: null,
          metadata_url: null,
          metadata_xml: null
        },
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            provider_id: provider.id
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The SAML provider could not be updated.'));
        return;
      }

      await refresh();
      showToast({
        title: enabled ? 'SAML provider enabled' : 'SAML provider disabled',
        tone: 'success'
      });
    } catch {
      setError('The SAML provider could not be updated. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  if (!can('platform_manage')) {
    return <Alert title="Platform settings are unavailable for this account." tone="danger" />;
  }

  return (
    <div aria-busy={isLoading || pendingAction !== null} className="grid gap-12">
      {error ? (
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
      ) : null}

      {createdClient ? (
        <div className="grid gap-3">
          <Alert
            actions={
              <Button
                onPress={() => {
                  setCreatedClient(null);
                }}
                size="small"
                tone="secondary"
              >
                I saved it
              </Button>
            }
            title="Save this client secret now. It cannot be retrieved again."
            tone="warning"
          />
          <CodeBlock
            code={`client_id=${createdClient.client_id}\nclient_secret=${createdClient.client_secret}`}
            label="OAuth client credentials"
          />
        </div>
      ) : null}

      <section className="grid gap-4" aria-labelledby="oauth-clients-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2
              className="m-0 font-display text-xl font-semibold tracking-tight text-text"
              id="oauth-clients-title"
            >
              OAuth clients
            </h2>
            <Badge>{oauthClients.length}</Badge>
          </div>
          <DialogTrigger isOpen={createOpen} onOpenChange={setCreateOpen}>
            <Button>Create client</Button>
            <Dialog
              description="Client credentials inherit only the selected permission ceiling."
              title="Create OAuth client"
            >
              <CreateOAuthClientForm
                onCreated={async (client) => {
                  await refresh();
                  setCreatedClient(client);
                  setCreateOpen(false);
                }}
              />
            </Dialog>
          </DialogTrigger>
        </div>
        {oauthClients.length === 0 ? (
          <EmptyState
            description="Create a confidential client for trusted service integrations."
            title="No OAuth clients"
          />
        ) : (
          <Table aria-label="OAuth clients">
            <TableHeader>
              <TableColumn isRowHeader>Client</TableColumn>
              <TableColumn>Scopes</TableColumn>
              <TableColumn>Events</TableColumn>
              <TableColumn>Last used</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody emptyState="No OAuth clients.">
              {oauthClients.map((client) => (
                <TableRow id={client.id} key={client.id}>
                  <TableCell>
                    <span className="grid gap-1">
                      <span className="font-medium text-text">{client.name}</span>
                      <span className="font-mono text-xs text-text-muted">{client.client_id}</span>
                    </span>
                  </TableCell>
                  <TableCell>{client.scopes.length}</TableCell>
                  <TableCell>
                    {client.event_ids.length === 0 ? 'Organization' : client.event_ids.length}
                  </TableCell>
                  <TableCell>{formatTimestamp(client.last_used_at)}</TableCell>
                  <TableCell>
                    {client.revoked_at ? (
                      <Badge tone="danger">Revoked</Badge>
                    ) : (
                      <DialogTrigger>
                        <Button isDisabled={pendingAction !== null} size="small" tone="danger">
                          Revoke
                        </Button>
                        <AlertDialog
                          actions={
                            <>
                              <Button slot="close" tone="quiet">
                                Keep client
                              </Button>
                              <Button
                                onPress={() => {
                                  void revokeOAuthClient(client);
                                }}
                                slot="close"
                                tone="danger"
                              >
                                Revoke client
                              </Button>
                            </>
                          }
                          description={`${client.name} will no longer be able to exchange its credentials for access tokens.`}
                          title="Revoke OAuth client?"
                        />
                      </DialogTrigger>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="oidc-title">
        <div className="flex items-center gap-3">
          <h2
            className="m-0 font-display text-xl font-semibold tracking-tight text-text"
            id="oidc-title"
          >
            OpenID Connect
          </h2>
          <Badge>{oidcProviders.length}</Badge>
        </div>
        {oidcProviders.length === 0 ? (
          <EmptyState
            description="No OpenID Connect providers are configured."
            title="No OpenID providers"
          />
        ) : (
          <Table aria-label="OpenID Connect providers">
            <TableHeader>
              <TableColumn isRowHeader>Provider</TableColumn>
              <TableColumn>Issuer</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody emptyState="No OpenID providers.">
              {oidcProviders.map((provider) => (
                <TableRow id={provider.id} key={provider.id}>
                  <TableCell>
                    <span className="grid gap-1">
                      <span>{provider.display_name}</span>
                      <span className="font-mono text-xs text-text-muted">{provider.key}</span>
                    </span>
                  </TableCell>
                  <TableCell>{provider.issuer_url}</TableCell>
                  <TableCell>
                    <Badge tone={provider.enabled ? 'success' : 'neutral'}>
                      {provider.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      isDisabled={pendingAction !== null}
                      onPress={() => {
                        void setOidcEnabled(provider, !provider.enabled);
                      }}
                      size="small"
                      tone="secondary"
                    >
                      {provider.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="saml-title">
        <div className="flex items-center gap-3">
          <h2
            className="m-0 font-display text-xl font-semibold tracking-tight text-text"
            id="saml-title"
          >
            SAML
          </h2>
          <Badge>{samlProviders.length}</Badge>
        </div>
        {samlProviders.length === 0 ? (
          <EmptyState description="No SAML providers are configured." title="No SAML providers" />
        ) : (
          <Table aria-label="SAML providers">
            <TableHeader>
              <TableColumn isRowHeader>Provider</TableColumn>
              <TableColumn>Entity ID</TableColumn>
              <TableColumn>Metadata</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody emptyState="No SAML providers.">
              {samlProviders.map((provider) => (
                <TableRow id={provider.id} key={provider.id}>
                  <TableCell>
                    <span className="grid gap-1">
                      <span>{provider.display_name}</span>
                      <span className="font-mono text-xs text-text-muted">{provider.key}</span>
                    </span>
                  </TableCell>
                  <TableCell>{provider.idp_entity_id}</TableCell>
                  <TableCell>{provider.metadata_verified ? 'Verified' : 'Unverified'}</TableCell>
                  <TableCell>
                    <Badge tone={provider.enabled ? 'success' : 'neutral'}>
                      {provider.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      isDisabled={pendingAction !== null}
                      onPress={() => {
                        void setSamlEnabled(provider, !provider.enabled);
                      }}
                      size="small"
                      tone="secondary"
                    >
                      {provider.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
