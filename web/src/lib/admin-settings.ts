import { z } from 'zod';

import type {
  CreateOidcProviderInput,
  CreateSamlProviderInput,
  UpdateOidcProviderInput,
  UpdateSamlProviderInput
} from '@/lib/api/client';

const MAX_SAML_METADATA_BYTES = 1024 * 1024;

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isAbsoluteHttpUrl(value: string, options?: { httpsOnly?: boolean; strict?: boolean }) {
  try {
    const url = new URL(value);
    const allowedScheme = options?.httpsOnly
      ? url.protocol === 'https:'
      : url.protocol === 'http:' || url.protocol === 'https:';

    return (
      allowedScheme &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      (!options?.strict || (!url.search && !url.hash))
    );
  } catch {
    return false;
  }
}

function optionalString(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

const providerKeySchema = z
  .string()
  .trim()
  .min(1, 'Enter a provider key.')
  .max(63, 'Use no more than 63 characters.')
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    'Use lowercase letters, numbers, and internal hyphens.'
  );

const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a display name.')
  .max(80, 'Use no more than 80 characters.');

const optionalAttributeSchema = z.string().trim().max(512, 'Use no more than 512 characters.');

export const oauthClientValuesSchema = z.object({
  event_ids: z
    .array(z.string())
    .max(100, 'Choose no more than 100 events.')
    .refine((values) => new Set(values).size === values.length, 'Choose each event once.'),
  name: z.string().trim().min(1, 'Enter a client name.').max(80, 'Use no more than 80 characters.'),
  scopes: z
    .array(z.string().trim().min(1))
    .min(1, 'Choose at least one scope.')
    .max(32, 'Choose no more than 32 scopes.')
    .refine((values) => new Set(values).size === values.length, 'Choose each scope once.')
});

export type OAuthClientValues = z.infer<typeof oauthClientValuesSchema>;

export function oauthClientSchemaFor(availableScopes: string[]) {
  const allowed = new Set(availableScopes);

  return oauthClientValuesSchema.refine(
    (values) => values.scopes.every((scope) => allowed.has(scope)),
    {
      message: 'Choose only permissions available to this account.',
      path: ['scopes']
    }
  );
}

export function canonicalScopeOptions(permissions: string[]): string[] {
  return [...new Set(permissions.map((permission) => permission.trim()).filter(Boolean))].sort();
}

export const oidcProviderValuesSchema = z.object({
  allow_email_link: z.boolean(),
  auto_provision: z.boolean(),
  client_id: z
    .string()
    .trim()
    .min(1, 'Enter the OAuth client ID.')
    .max(512, 'Use no more than 512 characters.'),
  client_secret: z
    .string()
    .refine((value) => utf8Length(value) <= 2048, 'Use no more than 2,048 bytes.'),
  display_name: displayNameSchema,
  enabled: z.boolean(),
  issuer_url: z
    .string()
    .trim()
    .refine(
      (value) => isAbsoluteHttpUrl(value, { strict: true }),
      'Enter an HTTP or HTTPS issuer URL without credentials, a query, or a fragment.'
    ),
  key: providerKeySchema
});

export type OidcProviderValues = z.infer<typeof oidcProviderValuesSchema>;

export function oidcProviderSchemaFor(mode: 'create' | 'update') {
  return oidcProviderValuesSchema.superRefine((values, context) => {
    const secretBytes = utf8Length(values.client_secret);

    if (mode === 'create' && secretBytes < 16) {
      context.addIssue({
        code: 'custom',
        message: 'Use at least 16 bytes.',
        path: ['client_secret']
      });
    }

    if (mode === 'update' && secretBytes > 0 && secretBytes < 16) {
      context.addIssue({
        code: 'custom',
        message: 'Use at least 16 bytes or leave this blank.',
        path: ['client_secret']
      });
    }
  });
}

export function buildOidcCreateInput(values: OidcProviderValues): CreateOidcProviderInput {
  return {
    allow_email_link: values.allow_email_link,
    auto_provision: values.auto_provision,
    client_id: values.client_id.trim(),
    client_secret: values.client_secret,
    display_name: values.display_name.trim(),
    enabled: values.enabled,
    issuer_url: values.issuer_url.trim(),
    key: values.key.trim()
  };
}

export function buildOidcUpdateInput(values: OidcProviderValues): UpdateOidcProviderInput {
  return {
    allow_email_link: values.allow_email_link,
    auto_provision: values.auto_provision,
    client_id: values.client_id.trim(),
    client_secret: optionalString(values.client_secret),
    display_name: values.display_name.trim(),
    enabled: values.enabled,
    issuer_url: values.issuer_url.trim()
  };
}

export const samlProviderValuesSchema = z.object({
  allow_email_link: z.boolean(),
  auto_provision: z.boolean(),
  display_name: displayNameSchema,
  display_name_attribute: optionalAttributeSchema,
  email_attribute: optionalAttributeSchema,
  enabled: z.boolean(),
  key: providerKeySchema,
  metadata_signing_certificate: z.string(),
  metadata_url: z
    .string()
    .trim()
    .refine(
      (value) => !value || isAbsoluteHttpUrl(value, { httpsOnly: true }),
      'Enter an HTTPS metadata URL without credentials.'
    ),
  metadata_xml: z
    .string()
    .refine(
      (value) => utf8Length(value) <= MAX_SAML_METADATA_BYTES,
      'Metadata must not exceed 1 MiB.'
    )
});

export type SamlProviderValues = z.infer<typeof samlProviderValuesSchema>;

export function samlProviderSchemaFor(mode: 'create' | 'update') {
  return samlProviderValuesSchema.superRefine((values, context) => {
    const hasUrl = Boolean(values.metadata_url.trim());
    const hasXml = Boolean(values.metadata_xml.trim());
    const hasSigningCertificate = Boolean(values.metadata_signing_certificate.trim());

    if (hasUrl && hasXml) {
      context.addIssue({
        code: 'custom',
        message: 'Provide a metadata URL or pasted XML, not both.',
        path: ['metadata_url']
      });
      context.addIssue({
        code: 'custom',
        message: 'Provide a metadata URL or pasted XML, not both.',
        path: ['metadata_xml']
      });
    }

    if (mode === 'create' && !hasUrl && !hasXml) {
      context.addIssue({
        code: 'custom',
        message: 'Provide a metadata URL or paste metadata XML.',
        path: ['metadata_url']
      });
      context.addIssue({
        code: 'custom',
        message: 'Provide a metadata URL or paste metadata XML.',
        path: ['metadata_xml']
      });
    }

    if (mode === 'update' && hasSigningCertificate && !hasUrl && !hasXml) {
      context.addIssue({
        code: 'custom',
        message: 'Provide replacement metadata when replacing the signing certificate.',
        path: ['metadata_signing_certificate']
      });
    }
  });
}

function buildSamlFields(values: SamlProviderValues) {
  return {
    allow_email_link: values.allow_email_link,
    auto_provision: values.auto_provision,
    display_name: values.display_name.trim(),
    display_name_attribute: optionalString(values.display_name_attribute),
    email_attribute: optionalString(values.email_attribute),
    enabled: values.enabled,
    metadata_signing_certificate: optionalString(values.metadata_signing_certificate),
    metadata_url: optionalString(values.metadata_url),
    metadata_xml: optionalString(values.metadata_xml)
  };
}

export function buildSamlCreateInput(values: SamlProviderValues): CreateSamlProviderInput {
  return {
    ...buildSamlFields(values),
    key: values.key.trim()
  };
}

export function buildSamlUpdateInput(values: SamlProviderValues): UpdateSamlProviderInput {
  return buildSamlFields(values);
}
