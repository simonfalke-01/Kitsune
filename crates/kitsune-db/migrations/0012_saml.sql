CREATE TABLE saml_providers (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
    idp_entity_id text NOT NULL CHECK (length(btrim(idp_entity_id)) BETWEEN 1 AND 2048),
    idp_metadata text NOT NULL CHECK (octet_length(idp_metadata) BETWEEN 1 AND 1048576),
    metadata_url text CHECK (metadata_url IS NULL OR length(metadata_url) BETWEEN 1 AND 2048),
    metadata_signing_certificate text CHECK (
        metadata_signing_certificate IS NULL
        OR octet_length(metadata_signing_certificate) BETWEEN 1 AND 65536
    ),
    metadata_verified boolean NOT NULL DEFAULT false,
    sp_entity_id text NOT NULL CHECK (length(btrim(sp_entity_id)) BETWEEN 1 AND 2048),
    acs_uri text NOT NULL CHECK (length(btrim(acs_uri)) BETWEEN 1 AND 2048),
    email_attribute text CHECK (email_attribute IS NULL OR length(email_attribute) BETWEEN 1 AND 512),
    display_name_attribute text CHECK (
        display_name_attribute IS NULL
        OR length(display_name_attribute) BETWEEN 1 AND 512
    ),
    enabled boolean NOT NULL DEFAULT true,
    auto_provision boolean NOT NULL DEFAULT true,
    allow_email_link boolean NOT NULL DEFAULT false,
    created_by uuid NOT NULL,
    updated_by uuid NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (organization_id, key),
    UNIQUE (id, organization_id),
    CONSTRAINT saml_providers_created_by_tenant_fk
        FOREIGN KEY (created_by, organization_id)
        REFERENCES users (id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT saml_providers_updated_by_tenant_fk
        FOREIGN KEY (updated_by, organization_id)
        REFERENCES users (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX saml_providers_public_idx
    ON saml_providers (organization_id, key)
    WHERE enabled = true;

CREATE TABLE saml_flows (
    id uuid PRIMARY KEY,
    provider_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    request_id text NOT NULL UNIQUE CHECK (length(request_id) BETWEEN 1 AND 512),
    relay_state_digest bytea NOT NULL UNIQUE CHECK (octet_length(relay_state_digest) = 32),
    encrypted_relay_state bytea NOT NULL CHECK (octet_length(encrypted_relay_state) <= 512),
    browser_binding_digest bytea NOT NULL CHECK (octet_length(browser_binding_digest) = 32),
    return_path text NOT NULL CHECK (length(return_path) BETWEEN 1 AND 2048),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL,
    CONSTRAINT saml_flows_provider_tenant_fk
        FOREIGN KEY (provider_id, organization_id)
        REFERENCES saml_providers (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX saml_flows_expiry_idx ON saml_flows (expires_at);

CREATE TABLE saml_replay_keys (
    key_digest bytea PRIMARY KEY CHECK (octet_length(key_digest) = 32),
    provider_id uuid NOT NULL REFERENCES saml_providers(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE INDEX saml_replay_keys_expiry_idx ON saml_replay_keys (expires_at);
