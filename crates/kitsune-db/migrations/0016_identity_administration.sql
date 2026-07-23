-- Role assignments are set semantics. NULLS NOT DISTINCT prevents duplicate
-- organization, event, team, and combined-scope grants under concurrent writes.
CREATE UNIQUE INDEX role_grants_unique_scope_idx
    ON role_grants (
        user_id,
        role_id,
        organization_id,
        event_id,
        team_id
    ) NULLS NOT DISTINCT;

CREATE INDEX users_org_created_idx
    ON users(organization_id, created_at DESC, id DESC);

CREATE INDEX roles_org_name_idx
    ON roles(organization_id, name, id)
    WHERE organization_id IS NOT NULL;
