'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { useSession } from '../../../session-context';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
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
  TextArea,
  TextField,
  showToast
} from '@/components/ui';
import {
  buildOidcCreateInput,
  buildOidcUpdateInput,
  buildSamlCreateInput,
  buildSamlUpdateInput,
  oidcProviderSchemaFor,
  samlProviderSchemaFor,
  type OidcProviderValues,
  type SamlProviderValues
} from '@/lib/admin-settings';
import { api, errorMessage, type OidcProvider, type SamlProvider } from '@/lib/api/client';

function OidcProviderForm({
  onSaved,
  provider
}: {
  onSaved: (provider: OidcProvider) => void;
  provider?: OidcProvider;
}) {
  const { session } = useSession();
  const mode = provider ? 'update' : 'create';
  const schema = oidcProviderSchemaFor(mode);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    clearErrors,
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { errors }
  } = useForm<OidcProviderValues>({
    defaultValues: {
      allow_email_link: provider?.allow_email_link ?? false,
      auto_provision: provider?.auto_provision ?? false,
      client_id: provider?.client_id ?? '',
      client_secret: '',
      display_name: provider?.display_name ?? '',
      enabled: provider?.enabled ?? false,
      issuer_url: provider?.issuer_url ?? '',
      key: provider?.key ?? ''
    }
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setError(null);
    const parsed = schema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (
          field === 'key' ||
          field === 'display_name' ||
          field === 'issuer_url' ||
          field === 'client_id' ||
          field === 'client_secret'
        ) {
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
      const result = provider
        ? await api.PUT('/api/v1/auth/oidc/providers/{provider_id}', {
            body: buildOidcUpdateInput(parsed.data),
            headers: {
              'x-csrf-token': session.csrf_token
            },
            params: {
              path: {
                provider_id: provider.id
              }
            }
          })
        : await api.POST('/api/v1/auth/oidc/providers', {
            body: buildOidcCreateInput(parsed.data),
            headers: {
              'x-csrf-token': session.csrf_token
            }
          });

      if (!result.data) {
        setError(errorMessage(result.error, 'The OpenID provider could not be saved.'));
        return;
      }

      onSaved(result.data);
      showToast({
        title: provider ? 'OpenID provider updated' : 'OpenID provider created',
        tone: 'success'
      });
    } catch {
      setError('The OpenID provider could not be saved. Check your connection and retry.');
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
        name="key"
        render={({ field }) => (
          <TextField
            autoComplete="off"
            autoFocus
            description={
              provider
                ? 'The provider key cannot be changed.'
                : 'Used in the authorization and callback paths.'
            }
            errorMessage={errors.key?.message}
            isDisabled={Boolean(provider)}
            isInvalid={Boolean(errors.key)}
            label="Provider key"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="display_name"
        render={({ field }) => (
          <TextField
            errorMessage={errors.display_name?.message}
            isInvalid={Boolean(errors.display_name)}
            label="Login label"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="issuer_url"
        render={({ field }) => (
          <TextField
            description="Use the exact issuer identifier from the provider discovery document."
            errorMessage={errors.issuer_url?.message}
            isInvalid={Boolean(errors.issuer_url)}
            label="Issuer URL"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            type="url"
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="client_id"
        render={({ field }) => (
          <TextField
            autoComplete="off"
            errorMessage={errors.client_id?.message}
            isInvalid={Boolean(errors.client_id)}
            label="Client ID"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="client_secret"
        render={({ field }) => (
          <TextField
            autoComplete="new-password"
            description={
              provider
                ? 'Leave blank to keep the encrypted secret already stored.'
                : 'The secret is encrypted before it is stored.'
            }
            errorMessage={errors.client_secret?.message}
            isInvalid={Boolean(errors.client_secret)}
            label={provider ? 'Replacement client secret' : 'Client secret'}
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            type="password"
            value={field.value}
          />
        )}
      />
      <fieldset className="grid gap-3 rounded-lg border border-border-subtle p-4">
        <legend className="px-2 text-sm font-semibold text-text">Login policy</legend>
        <Controller
          control={control}
          name="enabled"
          render={({ field }) => (
            <Checkbox isSelected={field.value} onChange={field.onChange}>
              Show this provider on the login page
            </Checkbox>
          )}
        />
        <Controller
          control={control}
          name="auto_provision"
          render={({ field }) => (
            <Checkbox isSelected={field.value} onChange={field.onChange}>
              Create a player after the first successful login
            </Checkbox>
          )}
        />
        <Controller
          control={control}
          name="allow_email_link"
          render={({ field }) => (
            <Checkbox isSelected={field.value} onChange={field.onChange}>
              Link an existing verified account with the same email
            </Checkbox>
          )}
        />
      </fieldset>
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isLoading={isSubmitting} type="submit">
        {provider ? 'Save OpenID provider' : 'Create OpenID provider'}
      </Button>
    </Form>
  );
}

function OidcProviderDialog({
  onSaved,
  provider
}: {
  onSaved: (provider: OidcProvider) => void;
  provider?: OidcProvider;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button size={provider ? 'small' : 'medium'} tone={provider ? 'secondary' : 'primary'}>
        {provider ? 'Edit' : 'Add OpenID provider'}
      </Button>
      <Dialog
        description="Kitsune derives the callback URL and keeps the provider secret encrypted."
        title={provider ? `Edit ${provider.display_name}` : 'Add OpenID provider'}
      >
        <OidcProviderForm
          onSaved={(saved) => {
            onSaved(saved);
            setIsOpen(false);
          }}
          provider={provider}
        />
      </Dialog>
    </DialogTrigger>
  );
}

function SamlProviderForm({
  onSaved,
  provider
}: {
  onSaved: (provider: SamlProvider) => void;
  provider?: SamlProvider;
}) {
  const { session } = useSession();
  const mode = provider ? 'update' : 'create';
  const schema = samlProviderSchemaFor(mode);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    clearErrors,
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { errors }
  } = useForm<SamlProviderValues>({
    defaultValues: {
      allow_email_link: provider?.allow_email_link ?? false,
      auto_provision: provider?.auto_provision ?? false,
      display_name: provider?.display_name ?? '',
      display_name_attribute: provider?.display_name_attribute ?? '',
      email_attribute: provider?.email_attribute ?? '',
      enabled: provider?.enabled ?? false,
      key: provider?.key ?? '',
      metadata_signing_certificate: '',
      metadata_url: '',
      metadata_xml: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setError(null);
    const parsed = schema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (
          field === 'key' ||
          field === 'display_name' ||
          field === 'metadata_url' ||
          field === 'metadata_xml' ||
          field === 'metadata_signing_certificate' ||
          field === 'email_attribute' ||
          field === 'display_name_attribute'
        ) {
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
      const result = provider
        ? await api.PUT('/api/v1/auth/saml/providers/{provider_id}', {
            body: buildSamlUpdateInput(parsed.data),
            headers: {
              'x-csrf-token': session.csrf_token
            },
            params: {
              path: {
                provider_id: provider.id
              }
            }
          })
        : await api.POST('/api/v1/auth/saml/providers', {
            body: buildSamlCreateInput(parsed.data),
            headers: {
              'x-csrf-token': session.csrf_token
            }
          });

      if (!result.data) {
        setError(errorMessage(result.error, 'The SAML provider could not be saved.'));
        return;
      }

      onSaved(result.data);
      showToast({
        title: provider ? 'SAML provider updated' : 'SAML provider created',
        tone: 'success'
      });
    } catch {
      setError('The SAML provider could not be saved. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  });

  const metadataDescription = provider
    ? provider.metadata_url
      ? `Leave both metadata fields blank to retain ${provider.metadata_url}.`
      : 'Leave both metadata fields blank to retain the stored XML.'
    : 'Provide exactly one metadata source.';

  return (
    <Form
      onSubmit={(event) => {
        void submit(event);
      }}
      validationBehavior="aria"
    >
      <Controller
        control={control}
        name="key"
        render={({ field }) => (
          <TextField
            autoComplete="off"
            autoFocus
            description={
              provider
                ? 'The provider key cannot be changed.'
                : 'Used in the metadata, assertion consumer, and login paths.'
            }
            errorMessage={errors.key?.message}
            isDisabled={Boolean(provider)}
            isInvalid={Boolean(errors.key)}
            label="Provider key"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="display_name"
        render={({ field }) => (
          <TextField
            errorMessage={errors.display_name?.message}
            isInvalid={Boolean(errors.display_name)}
            label="Login label"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <fieldset className="grid gap-4 rounded-lg border border-border-subtle p-4">
        <legend className="px-2 text-sm font-semibold text-text">Identity provider metadata</legend>
        <p className="m-0 text-sm text-text-muted">{metadataDescription}</p>
        <Controller
          control={control}
          name="metadata_url"
          render={({ field }) => (
            <TextField
              errorMessage={errors.metadata_url?.message}
              isInvalid={Boolean(errors.metadata_url)}
              label={provider ? 'Replacement metadata URL' : 'Metadata URL'}
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              type="url"
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="metadata_xml"
          render={({ field }) => (
            <TextArea
              errorMessage={errors.metadata_xml?.message}
              isInvalid={Boolean(errors.metadata_xml)}
              label={provider ? 'Replacement metadata XML' : 'Metadata XML'}
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              rows={8}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="metadata_signing_certificate"
          render={({ field }) => (
            <TextArea
              description="Optional PEM certificate used to verify a signed metadata document."
              errorMessage={errors.metadata_signing_certificate?.message}
              isInvalid={Boolean(errors.metadata_signing_certificate)}
              label="Pinned metadata signing certificate"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              rows={4}
              value={field.value}
            />
          )}
        />
      </fieldset>
      <fieldset className="grid gap-4 rounded-lg border border-border-subtle p-4">
        <legend className="px-2 text-sm font-semibold text-text">Assertion attributes</legend>
        <Controller
          control={control}
          name="email_attribute"
          render={({ field }) => (
            <TextField
              description="Optional exact signed assertion attribute containing email."
              errorMessage={errors.email_attribute?.message}
              isInvalid={Boolean(errors.email_attribute)}
              label="Email attribute"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="display_name_attribute"
          render={({ field }) => (
            <TextField
              description="Optional exact signed assertion attribute containing display name."
              errorMessage={errors.display_name_attribute?.message}
              isInvalid={Boolean(errors.display_name_attribute)}
              label="Display name attribute"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />
      </fieldset>
      <fieldset className="grid gap-3 rounded-lg border border-border-subtle p-4">
        <legend className="px-2 text-sm font-semibold text-text">Login policy</legend>
        <Controller
          control={control}
          name="enabled"
          render={({ field }) => (
            <Checkbox isSelected={field.value} onChange={field.onChange}>
              Show this provider on the login page
            </Checkbox>
          )}
        />
        <Controller
          control={control}
          name="auto_provision"
          render={({ field }) => (
            <Checkbox isSelected={field.value} onChange={field.onChange}>
              Create a player after the first successful login
            </Checkbox>
          )}
        />
        <Controller
          control={control}
          name="allow_email_link"
          render={({ field }) => (
            <Checkbox isSelected={field.value} onChange={field.onChange}>
              Link an existing verified account with the same email
            </Checkbox>
          )}
        />
      </fieldset>
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isLoading={isSubmitting} type="submit">
        {provider ? 'Save SAML provider' : 'Create SAML provider'}
      </Button>
    </Form>
  );
}

function SamlProviderDialog({
  onSaved,
  provider
}: {
  onSaved: (provider: SamlProvider) => void;
  provider?: SamlProvider;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button size={provider ? 'small' : 'medium'} tone={provider ? 'secondary' : 'primary'}>
        {provider ? 'Edit' : 'Add SAML provider'}
      </Button>
      <Dialog
        description="Kitsune validates metadata and derives the service-provider endpoints."
        title={provider ? `Edit ${provider.display_name}` : 'Add SAML provider'}
      >
        <SamlProviderForm
          onSaved={(saved) => {
            onSaved(saved);
            setIsOpen(false);
          }}
          provider={provider}
        />
      </Dialog>
    </DialogTrigger>
  );
}

export function IdentityProviderSettings({
  initialOidcProviders,
  initialSamlProviders
}: {
  initialOidcProviders: OidcProvider[];
  initialSamlProviders: SamlProvider[];
}) {
  const { session } = useSession();
  const [oidcProviders, setOidcProviders] = useState(initialOidcProviders);
  const [samlProviders, setSamlProviders] = useState(initialSamlProviders);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const replaceOidc = (saved: OidcProvider) => {
    setOidcProviders((current) => {
      const exists = current.some((provider) => provider.id === saved.id);
      return exists
        ? current.map((provider) => (provider.id === saved.id ? saved : provider))
        : [saved, ...current];
    });
  };

  const replaceSaml = (saved: SamlProvider) => {
    setSamlProviders((current) => {
      const exists = current.some((provider) => provider.id === saved.id);
      return exists
        ? current.map((provider) => (provider.id === saved.id ? saved : provider))
        : [saved, ...current];
    });
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

      replaceOidc(result.data);
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

      replaceSaml(result.data);
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

  return (
    <div aria-busy={pendingAction !== null} className="grid gap-12">
      {error ? <Alert title={error} tone="danger" /> : null}

      <section className="grid gap-4" aria-labelledby="oidc-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2
              className="m-0 font-display text-xl font-semibold tracking-tight text-text"
              id="oidc-title"
            >
              OpenID Connect
            </h2>
            <Badge>{oidcProviders.length}</Badge>
          </div>
          <OidcProviderDialog onSaved={replaceOidc} />
        </div>
        {oidcProviders.length === 0 ? (
          <EmptyState
            description="Add an OpenID Connect provider for organization sign-in."
            title="No OpenID providers"
          />
        ) : (
          <Table aria-label="OpenID Connect providers">
            <TableHeader>
              <TableColumn isRowHeader>Provider</TableColumn>
              <TableColumn>Issuer</TableColumn>
              <TableColumn>Callback</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody emptyState="No OpenID providers.">
              {oidcProviders.map((provider) => (
                <TableRow id={provider.id} key={provider.id}>
                  <TableCell>
                    <span className="grid gap-1">
                      <span className="font-medium text-text">{provider.display_name}</span>
                      <span className="font-mono text-xs text-text-muted">{provider.key}</span>
                    </span>
                  </TableCell>
                  <TableCell>{provider.issuer_url}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-text-muted">
                      {provider.redirect_uri}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge tone={provider.enabled ? 'success' : 'neutral'}>
                      {provider.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-2">
                      <OidcProviderDialog onSaved={replaceOidc} provider={provider} />
                      <Button
                        isDisabled={pendingAction !== null}
                        isLoading={pendingAction === provider.id}
                        onPress={() => {
                          void setOidcEnabled(provider, !provider.enabled);
                        }}
                        size="small"
                        tone="secondary"
                      >
                        {provider.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="saml-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2
              className="m-0 font-display text-xl font-semibold tracking-tight text-text"
              id="saml-title"
            >
              SAML
            </h2>
            <Badge>{samlProviders.length}</Badge>
          </div>
          <SamlProviderDialog onSaved={replaceSaml} />
        </div>
        {samlProviders.length === 0 ? (
          <EmptyState
            description="Add a SAML identity provider for organization sign-in."
            title="No SAML providers"
          />
        ) : (
          <Table aria-label="SAML providers">
            <TableHeader>
              <TableColumn isRowHeader>Provider</TableColumn>
              <TableColumn>Identity provider</TableColumn>
              <TableColumn>Service provider</TableColumn>
              <TableColumn>Metadata</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody emptyState="No SAML providers.">
              {samlProviders.map((provider) => (
                <TableRow id={provider.id} key={provider.id}>
                  <TableCell>
                    <span className="grid gap-1">
                      <span className="font-medium text-text">{provider.display_name}</span>
                      <span className="font-mono text-xs text-text-muted">{provider.key}</span>
                    </span>
                  </TableCell>
                  <TableCell>{provider.idp_entity_id}</TableCell>
                  <TableCell>
                    <span className="grid gap-1">
                      <span className="font-mono text-xs text-text-muted">
                        {provider.sp_entity_id}
                      </span>
                      <span className="font-mono text-xs text-text-muted">{provider.acs_uri}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {provider.metadata_verified ? 'Signature verified' : 'Accepted'}
                  </TableCell>
                  <TableCell>
                    <Badge tone={provider.enabled ? 'success' : 'neutral'}>
                      {provider.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-2">
                      <SamlProviderDialog onSaved={replaceSaml} provider={provider} />
                      <Button
                        isDisabled={pendingAction !== null}
                        isLoading={pendingAction === provider.id}
                        onPress={() => {
                          void setSamlEnabled(provider, !provider.enabled);
                        }}
                        size="small"
                        tone="secondary"
                      >
                        {provider.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </span>
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
