ALTER TABLE webauthn_credentials
    RENAME COLUMN public_key TO credential;

ALTER TABLE webauthn_credentials
    ADD COLUMN organization_id uuid,
    ADD COLUMN revoked_at timestamptz;

UPDATE webauthn_credentials AS credential
SET organization_id = users.organization_id
FROM users
WHERE users.id = credential.user_id;

ALTER TABLE webauthn_credentials
    ALTER COLUMN organization_id SET NOT NULL,
    ADD CONSTRAINT webauthn_credentials_user_tenant_fk
        FOREIGN KEY (user_id, organization_id)
        REFERENCES users (id, organization_id)
        ON DELETE CASCADE;

CREATE INDEX webauthn_credentials_user_active_idx
    ON webauthn_credentials (user_id, created_at)
    WHERE revoked_at IS NULL;

CREATE TABLE webauthn_flows (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('registration', 'authentication')),
    browser_binding_digest bytea NOT NULL,
    encrypted_state bytea NOT NULL,
    return_path text NOT NULL CHECK (
        left(return_path, 1) = '/'
        AND left(return_path, 2) <> '//'
        AND char_length(return_path) <= 2048
    ),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL,
    CONSTRAINT webauthn_flows_user_tenant_fk
        FOREIGN KEY (user_id, organization_id)
        REFERENCES users (id, organization_id)
        ON DELETE CASCADE
);

CREATE INDEX webauthn_flows_expiry_idx
    ON webauthn_flows (expires_at)
    WHERE consumed_at IS NULL;
