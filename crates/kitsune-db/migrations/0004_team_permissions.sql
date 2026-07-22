-- Keep managed roles safe across upgrades and make invite-code lookup unambiguous.
UPDATE roles
SET permissions = (
    SELECT array_agg(DISTINCT permission ORDER BY permission)
    FROM unnest(
        permissions
        || ARRAY['team_create', 'team_join', 'team_captain', 'team_manage']::text[]
    ) AS permission
)
WHERE built_in AND key = 'super_admin';

UPDATE roles
SET permissions = (
    SELECT array_agg(DISTINCT permission ORDER BY permission)
    FROM unnest(
        permissions
        || ARRAY['team_create', 'team_join', 'team_captain']::text[]
    ) AS permission
)
WHERE built_in AND key = 'player';

CREATE UNIQUE INDEX teams_invite_code_digest_idx
    ON teams (organization_id, invite_code_digest);
