ALTER TABLE oauth_clients
    ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN name text,
    ADD COLUMN event_ids uuid[] NOT NULL DEFAULT '{}',
    ADD COLUMN last_used_at timestamptz,
    ADD COLUMN revoked_at timestamptz;

ALTER TABLE oauth_clients
    ADD CONSTRAINT oauth_clients_name_length
    CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 80);

CREATE INDEX oauth_clients_owner_idx
    ON oauth_clients (organization_id, user_id, created_at DESC);

CREATE INDEX oauth_clients_active_idx
    ON oauth_clients (id)
    WHERE disabled = false AND revoked_at IS NULL;
