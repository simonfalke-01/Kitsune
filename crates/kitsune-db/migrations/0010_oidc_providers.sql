CREATE TABLE oidc_providers (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
    issuer_url text NOT NULL,
    client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 512),
    encrypted_client_secret bytea NOT NULL,
    redirect_uri text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    auto_provision boolean NOT NULL DEFAULT true,
    allow_email_link boolean NOT NULL DEFAULT false,
    created_by uuid NOT NULL,
    updated_by uuid NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (organization_id, key),
    UNIQUE (id, organization_id),
    CONSTRAINT oidc_providers_created_by_tenant_fk
        FOREIGN KEY (created_by, organization_id)
        REFERENCES users (id, organization_id),
    CONSTRAINT oidc_providers_updated_by_tenant_fk
        FOREIGN KEY (updated_by, organization_id)
        REFERENCES users (id, organization_id)
);

CREATE INDEX oidc_providers_discovery_idx
    ON oidc_providers (organization_id, key)
    WHERE enabled = true;

CREATE TABLE oidc_flows (
    id uuid PRIMARY KEY,
    provider_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    state_digest bytea NOT NULL UNIQUE,
    browser_binding_digest bytea NOT NULL,
    encrypted_pkce_verifier bytea NOT NULL,
    encrypted_nonce bytea NOT NULL,
    return_path text NOT NULL CHECK (
        left(return_path, 1) = '/'
        AND left(return_path, 2) <> '//'
        AND char_length(return_path) <= 2048
    ),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL,
    CONSTRAINT oidc_flows_provider_tenant_fk
        FOREIGN KEY (provider_id, organization_id)
        REFERENCES oidc_providers (id, organization_id)
        ON DELETE CASCADE
);

CREATE INDEX oidc_flows_expiry_idx
    ON oidc_flows (expires_at)
    WHERE consumed_at IS NULL;
