import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsAdminView } from './settings-admin-view';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  permissions: ['event_read'],
  session: {
    csrf_token: 'csrf',
    permissions: ['event_read']
  },
  put: vi.fn()
}));

vi.mock('../../../event-context', () => ({
  useEvent: () => ({
    events: []
  })
}));

vi.mock('../../../session-context', () => ({
  useSession: () => ({
    can: (permission: string) => mocks.permissions.includes(permission),
    session: mocks.session
  })
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    DELETE: mocks.delete,
    GET: mocks.get,
    POST: mocks.post,
    PUT: mocks.put
  },
  errorMessage: (_error: unknown, fallback: string) => fallback
}));

describe('SettingsAdminView', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.put.mockReset();
    mocks.delete.mockReset();
    mocks.permissions = ['event_read'];
    mocks.session.permissions = ['event_read'];
    window.localStorage.clear();
  });

  it('keeps OAuth clients available while guarding identity providers by their API permission', () => {
    render(
      <SettingsAdminView
        initialError="Platform settings could not be loaded."
        initialOAuthClients={[]}
        initialOidcProviders={[]}
        initialSamlProviders={[]}
      />
    );

    expect(screen.getByRole('heading', { name: 'OAuth clients' })).toBeVisible();
    expect(screen.queryByText('Platform settings could not be loaded.')).not.toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Identity providers' }));

    expect(
      screen.getByText('Identity provider management is unavailable for this account')
    ).toBeVisible();
    expect(screen.getByText(/identity_manage permission is required/)).toBeVisible();
  });

  it('provides a browser-backed presentation draft before backend integration', () => {
    render(
      <SettingsAdminView
        initialError={null}
        initialOAuthClients={[]}
        initialOidcProviders={[]}
        initialSamlProviders={[]}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Presentation' }));

    expect(screen.getByText('Frontend preview')).toBeVisible();
    expect(screen.getByLabelText('Event name')).toHaveValue('Kitsune');
    expect(screen.getByText('Marks')).toBeVisible();
    expect(screen.getByText('Home content')).toBeVisible();
    expect(screen.getByText('Sponsors')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save browser draft' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add sponsor' }));

    expect(screen.getByLabelText('Name')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save browser draft' })).toBeEnabled();
  });

  it('creates an OpenID provider through the generated endpoint', async () => {
    mocks.permissions = ['identity_manage'];
    mocks.session.permissions = ['identity_manage'];
    mocks.post.mockResolvedValue({
      data: {
        allow_email_link: false,
        auto_provision: true,
        client_id: 'kitsune-client',
        created_at: '2026-07-27T00:00:00Z',
        display_name: 'Organization login',
        enabled: false,
        id: 'oidc-provider',
        issuer_url: 'https://identity.example.com',
        key: 'organization',
        redirect_uri: 'https://kitsune.example/api/v1/auth/oidc/example/organization/callback',
        updated_at: '2026-07-27T00:00:00Z'
      }
    });

    render(
      <SettingsAdminView
        initialError={null}
        initialOAuthClients={[]}
        initialOidcProviders={[]}
        initialSamlProviders={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add OpenID provider' }));
    fireEvent.change(screen.getByLabelText('Provider key'), {
      target: { value: 'organization' }
    });
    fireEvent.change(screen.getByLabelText('Login label'), {
      target: { value: 'Organization login' }
    });
    fireEvent.change(screen.getByLabelText('Issuer URL'), {
      target: { value: 'https://identity.example.com' }
    });
    fireEvent.change(screen.getByLabelText('Client ID'), {
      target: { value: 'kitsune-client' }
    });
    fireEvent.change(screen.getByLabelText('Client secret'), {
      target: { value: 'sixteen-byte-key' }
    });
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Create a player after the first successful login'
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create OpenID provider' }));

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith('/api/v1/auth/oidc/providers', {
        body: {
          allow_email_link: false,
          auto_provision: true,
          client_id: 'kitsune-client',
          client_secret: 'sixteen-byte-key',
          display_name: 'Organization login',
          enabled: false,
          issuer_url: 'https://identity.example.com',
          key: 'organization'
        },
        headers: {
          'x-csrf-token': 'csrf'
        }
      });
    });
  });

  it('creates a SAML provider from one metadata source', async () => {
    mocks.permissions = ['identity_manage'];
    mocks.session.permissions = ['identity_manage'];
    mocks.post.mockResolvedValue({
      data: {
        acs_uri: 'https://kitsune.example/api/v1/auth/saml/example/organization/acs',
        allow_email_link: false,
        auto_provision: false,
        created_at: '2026-07-27T00:00:00Z',
        display_name: 'Organization SAML',
        display_name_attribute: null,
        email_attribute: null,
        enabled: false,
        id: 'saml-provider',
        idp_entity_id: 'https://identity.example.com',
        key: 'organization',
        metadata_url: 'https://identity.example.com/metadata',
        metadata_verified: false,
        sp_entity_id: 'https://kitsune.example/api/v1/auth/saml/example/organization/metadata',
        updated_at: '2026-07-27T00:00:00Z'
      }
    });

    render(
      <SettingsAdminView
        initialError={null}
        initialOAuthClients={[]}
        initialOidcProviders={[]}
        initialSamlProviders={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add SAML provider' }));
    fireEvent.change(screen.getByLabelText('Provider key'), {
      target: { value: 'organization' }
    });
    fireEvent.change(screen.getByLabelText('Login label'), {
      target: { value: 'Organization SAML' }
    });
    fireEvent.change(screen.getByLabelText('Metadata URL'), {
      target: { value: 'https://identity.example.com/metadata' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create SAML provider' }));

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith('/api/v1/auth/saml/providers', {
        body: {
          allow_email_link: false,
          auto_provision: false,
          display_name: 'Organization SAML',
          display_name_attribute: null,
          email_attribute: null,
          enabled: false,
          key: 'organization',
          metadata_signing_certificate: null,
          metadata_url: 'https://identity.example.com/metadata',
          metadata_xml: null
        },
        headers: {
          'x-csrf-token': 'csrf'
        }
      });
    });
  });

  it('updates an OpenID provider while retaining its stored secret', async () => {
    mocks.permissions = ['identity_manage'];
    mocks.session.permissions = ['identity_manage'];
    const provider = {
      allow_email_link: true,
      auto_provision: true,
      client_id: 'kitsune-client',
      created_at: '2026-07-27T00:00:00Z',
      display_name: 'Organization login',
      enabled: true,
      id: 'oidc-provider',
      issuer_url: 'https://identity.example.com',
      key: 'organization',
      redirect_uri: 'https://kitsune.example/api/v1/auth/oidc/example/organization/callback',
      updated_at: '2026-07-27T00:00:00Z'
    };
    mocks.put.mockResolvedValue({ data: provider });

    render(
      <SettingsAdminView
        initialError={null}
        initialOAuthClients={[]}
        initialOidcProviders={[provider]}
        initialSamlProviders={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save OpenID provider' }));

    await waitFor(() => {
      expect(mocks.put).toHaveBeenCalledWith('/api/v1/auth/oidc/providers/{provider_id}', {
        body: {
          allow_email_link: true,
          auto_provision: true,
          client_id: 'kitsune-client',
          client_secret: null,
          display_name: 'Organization login',
          enabled: true,
          issuer_url: 'https://identity.example.com'
        },
        headers: {
          'x-csrf-token': 'csrf'
        },
        params: {
          path: {
            provider_id: 'oidc-provider'
          }
        }
      });
    });
  });

  it('disables a SAML provider without replacing retained metadata', async () => {
    mocks.permissions = ['identity_manage'];
    mocks.session.permissions = ['identity_manage'];
    const provider = {
      acs_uri: 'https://kitsune.example/api/v1/auth/saml/example/organization/acs',
      allow_email_link: false,
      auto_provision: true,
      created_at: '2026-07-27T00:00:00Z',
      display_name: 'Organization SAML',
      display_name_attribute: 'displayName',
      email_attribute: 'email',
      enabled: true,
      id: 'saml-provider',
      idp_entity_id: 'https://identity.example.com',
      key: 'organization',
      metadata_url: 'https://identity.example.com/metadata',
      metadata_verified: true,
      sp_entity_id: 'https://kitsune.example/api/v1/auth/saml/example/organization/metadata',
      updated_at: '2026-07-27T00:00:00Z'
    };
    mocks.put.mockResolvedValue({
      data: {
        ...provider,
        enabled: false
      }
    });

    render(
      <SettingsAdminView
        initialError={null}
        initialOAuthClients={[]}
        initialOidcProviders={[]}
        initialSamlProviders={[provider]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => {
      expect(mocks.put).toHaveBeenCalledWith('/api/v1/auth/saml/providers/{provider_id}', {
        body: {
          allow_email_link: false,
          auto_provision: true,
          display_name: 'Organization SAML',
          display_name_attribute: 'displayName',
          email_attribute: 'email',
          enabled: false,
          metadata_signing_certificate: null,
          metadata_url: null,
          metadata_xml: null
        },
        headers: {
          'x-csrf-token': 'csrf'
        },
        params: {
          path: {
            provider_id: 'saml-provider'
          }
        }
      });
    });
  });

  it('requires an acknowledgment before dismissing a one-time OAuth secret', async () => {
    mocks.post.mockResolvedValue({
      data: {
        client_id: 'kitc_client',
        client_secret: 'kits_secret',
        created_at: '2026-07-27T00:00:00Z',
        event_ids: [],
        id: 'oauth-client',
        last_used_at: null,
        name: 'Score sync',
        revoked_at: null,
        scopes: ['event_read']
      }
    });

    render(
      <SettingsAdminView
        initialError={null}
        initialOAuthClients={[]}
        initialOidcProviders={[]}
        initialSamlProviders={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create client' }));
    fireEvent.change(screen.getByLabelText('Client name'), {
      target: { value: 'Score sync' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create OAuth client' }));

    await waitFor(() => {
      expect(screen.getByText('Save these credentials now')).toBeVisible();
    });

    const dismiss = screen.getByRole('button', { name: 'Dismiss credentials' });
    expect(dismiss).toBeDisabled();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'I copied the client ID and secret to secure storage.'
      })
    );

    expect(dismiss).toBeEnabled();
  });

  it('confirms OAuth client revocation before calling the generated endpoint', async () => {
    mocks.delete.mockResolvedValue({
      response: {
        ok: true
      }
    });

    render(
      <SettingsAdminView
        initialError={null}
        initialOAuthClients={[
          {
            client_id: 'kitc_client',
            created_at: '2026-07-27T00:00:00Z',
            event_ids: [],
            id: 'oauth-client',
            last_used_at: null,
            name: 'Score sync',
            revoked_at: null,
            scopes: ['event_read']
          }
        ]}
        initialOidcProviders={[]}
        initialSamlProviders={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(screen.getByText('Revoke OAuth client?')).toBeVisible();
    expect(mocks.delete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke client' }));

    await waitFor(() => {
      expect(mocks.delete).toHaveBeenCalledWith('/api/v1/auth/oauth-clients/{client_id}', {
        headers: {
          'x-csrf-token': 'csrf'
        },
        params: {
          path: {
            client_id: 'oauth-client'
          }
        }
      });
    });
  });
});
