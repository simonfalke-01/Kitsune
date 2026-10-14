import { describe, expect, it } from 'vitest';

import {
  buildOidcCreateInput,
  buildOidcUpdateInput,
  buildSamlCreateInput,
  buildSamlUpdateInput,
  canonicalScopeOptions,
  oauthClientSchemaFor,
  oidcProviderSchemaFor,
  samlProviderSchemaFor,
  type OidcProviderValues,
  type SamlProviderValues
} from './admin-settings';

const oidcValues: OidcProviderValues = {
  allow_email_link: false,
  auto_provision: true,
  client_id: 'kitsune-client',
  client_secret: 'sixteen-byte-key',
  display_name: 'Organization login',
  enabled: false,
  issuer_url: 'https://identity.example.com/tenant',
  key: 'organization'
};

const samlValues: SamlProviderValues = {
  allow_email_link: false,
  auto_provision: true,
  display_name: 'Organization login',
  display_name_attribute: ' displayName ',
  email_attribute: ' email ',
  enabled: false,
  key: 'organization',
  metadata_signing_certificate: '',
  metadata_url: 'https://identity.example.com/metadata',
  metadata_xml: ''
};

describe('admin settings validation', () => {
  it('canonicalizes delegated scope options and rejects scopes outside the caller ceiling', () => {
    expect(canonicalScopeOptions(['event_read', ' challenge_read ', 'event_read', ''])).toEqual([
      'challenge_read',
      'event_read'
    ]);

    const schema = oauthClientSchemaFor(['event_read']);

    expect(
      schema.safeParse({
        event_ids: [],
        name: 'Score sync',
        scopes: ['event_read']
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({
        event_ids: [],
        name: 'Score sync',
        scopes: ['platform_manage']
      }).success
    ).toBe(false);
  });

  it('validates OIDC issuer URLs and secret replacement rules', () => {
    expect(oidcProviderSchemaFor('create').safeParse(oidcValues).success).toBe(true);
    expect(
      oidcProviderSchemaFor('create').safeParse({
        ...oidcValues,
        issuer_url: 'https://identity.example.com?tenant=one'
      }).success
    ).toBe(false);
    expect(
      oidcProviderSchemaFor('update').safeParse({
        ...oidcValues,
        client_secret: ''
      }).success
    ).toBe(true);
    expect(
      oidcProviderSchemaFor('update').safeParse({
        ...oidcValues,
        client_secret: 'short'
      }).success
    ).toBe(false);
  });

  it('builds trimmed OIDC API request shapes without resending a retained secret', () => {
    expect(
      buildOidcCreateInput({
        ...oidcValues,
        client_id: ' client ',
        display_name: ' Organization login ',
        issuer_url: ' https://identity.example.com/tenant ',
        key: ' organization '
      })
    ).toEqual({
      allow_email_link: false,
      auto_provision: true,
      client_id: 'client',
      client_secret: 'sixteen-byte-key',
      display_name: 'Organization login',
      enabled: false,
      issuer_url: 'https://identity.example.com/tenant',
      key: 'organization'
    });
    expect(
      buildOidcUpdateInput({
        ...oidcValues,
        client_secret: ' '
      }).client_secret
    ).toBeNull();
  });

  it('requires exactly one SAML metadata source when creating a provider', () => {
    expect(samlProviderSchemaFor('create').safeParse(samlValues).success).toBe(true);
    expect(
      samlProviderSchemaFor('create').safeParse({
        ...samlValues,
        metadata_url: '',
        metadata_xml: ''
      }).success
    ).toBe(false);
    expect(
      samlProviderSchemaFor('create').safeParse({
        ...samlValues,
        metadata_xml: '<EntityDescriptor />'
      }).success
    ).toBe(false);
  });

  it('retains SAML metadata on update and requires metadata with a replacement certificate', () => {
    expect(
      samlProviderSchemaFor('update').safeParse({
        ...samlValues,
        metadata_url: '',
        metadata_xml: ''
      }).success
    ).toBe(true);
    expect(
      samlProviderSchemaFor('update').safeParse({
        ...samlValues,
        metadata_signing_certificate: '-----BEGIN CERTIFICATE-----',
        metadata_url: '',
        metadata_xml: ''
      }).success
    ).toBe(false);
  });

  it('builds nullable SAML request fields for the generated API shapes', () => {
    expect(
      buildSamlCreateInput({
        ...samlValues,
        display_name: ' Organization login ',
        key: ' organization '
      })
    ).toMatchObject({
      display_name: 'Organization login',
      display_name_attribute: 'displayName',
      email_attribute: 'email',
      key: 'organization',
      metadata_url: 'https://identity.example.com/metadata',
      metadata_xml: null
    });

    expect(
      buildSamlUpdateInput({
        ...samlValues,
        metadata_url: '',
        metadata_xml: ''
      })
    ).toMatchObject({
      metadata_signing_certificate: null,
      metadata_url: null,
      metadata_xml: null
    });
  });
});
