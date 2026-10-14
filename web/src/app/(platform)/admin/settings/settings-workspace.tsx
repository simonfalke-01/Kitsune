'use client';

import { useState } from 'react';

import { IdentityProviderSettings } from './identity-provider-settings';
import { OAuthClientSettings } from './oauth-client-settings';
import { PresentationSettings } from './presentation-settings';
import { useSession } from '../../../session-context';
import { Alert, Button, Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui';
import { api, type OAuthClient, type OidcProvider, type SamlProvider } from '@/lib/api/client';

interface SettingsAdminViewProps {
  initialError: string | null;
  initialOAuthClients: OAuthClient[];
  initialOidcProviders: OidcProvider[];
  initialSamlProviders: SamlProvider[];
}

export function SettingsAdminView({
  initialError,
  initialOAuthClients,
  initialOidcProviders,
  initialSamlProviders
}: SettingsAdminViewProps) {
  const { can, session } = useSession();
  const canManageIdentity = can('identity_manage');
  const [error, setError] = useState(canManageIdentity ? initialError : null);
  const [oauthClients, setOAuthClients] = useState(initialOAuthClients);
  const [oidcProviders, setOidcProviders] = useState(initialOidcProviders);
  const [samlProviders, setSamlProviders] = useState(initialSamlProviders);
  const [isLoading, setIsLoading] = useState(false);
  const [bootstrapVersion, setBootstrapVersion] = useState(0);

  const refresh = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const oauthResult = await api.GET('/api/v1/auth/oauth-clients');

      if (!oauthResult.data) {
        setError('OAuth clients could not be loaded.');
        return;
      }

      let nextOidcProviders = oidcProviders;
      let nextSamlProviders = samlProviders;

      if (canManageIdentity) {
        const [oidcResult, samlResult] = await Promise.all([
          api.GET('/api/v1/auth/oidc/providers'),
          api.GET('/api/v1/auth/saml/providers')
        ]);

        if (!oidcResult.data || !samlResult.data) {
          setError(
            'Identity providers could not be loaded. External authentication may be unavailable on this deployment.'
          );
          return;
        }

        nextOidcProviders = oidcResult.data;
        nextSamlProviders = samlResult.data;
      }

      setOAuthClients(oauthResult.data);
      setOidcProviders(nextOidcProviders);
      setSamlProviders(nextSamlProviders);
      setBootstrapVersion((current) => current + 1);
    } catch {
      setError('Settings could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!session) {
    return <Alert title="Settings are unavailable without an interactive session." tone="danger" />;
  }

  return (
    <div aria-busy={isLoading} className="grid gap-6">
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

      <Tabs defaultSelectedKey={canManageIdentity ? 'identity' : 'oauth'}>
        <TabsList aria-label="Settings groups">
          <TabsTab id="identity">Identity providers</TabsTab>
          <TabsTab id="oauth">OAuth clients</TabsTab>
          <TabsTab id="presentation">Presentation</TabsTab>
        </TabsList>

        <TabsPanel id="identity">
          {canManageIdentity ? (
            <IdentityProviderSettings
              initialOidcProviders={oidcProviders}
              initialSamlProviders={samlProviders}
              key={`identity-${bootstrapVersion}`}
            />
          ) : (
            <Alert
              description="The identity_manage permission is required to list or change OpenID Connect and SAML providers."
              title="Identity provider management is unavailable for this account"
              tone="warning"
            />
          )}
        </TabsPanel>

        <TabsPanel id="oauth">
          <OAuthClientSettings initialClients={oauthClients} key={`oauth-${bootstrapVersion}`} />
        </TabsPanel>

        <TabsPanel id="presentation">
          <PresentationSettings />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
