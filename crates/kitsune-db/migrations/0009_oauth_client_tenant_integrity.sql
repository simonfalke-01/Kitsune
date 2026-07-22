DROP INDEX oauth_clients_active_idx;

ALTER TABLE users
    ADD CONSTRAINT users_id_organization_unique
    UNIQUE (id, organization_id);

ALTER TABLE oauth_clients
    DROP CONSTRAINT oauth_clients_user_id_fkey,
    ADD CONSTRAINT oauth_clients_owner_tenant_fk
    FOREIGN KEY (user_id, organization_id)
    REFERENCES users (id, organization_id)
    ON DELETE CASCADE;
