-- Enforce the blessed one-team-per-organization identity rule under races.
ALTER TABLE team_members ADD COLUMN organization_id uuid;

UPDATE team_members membership
SET organization_id = team.organization_id
FROM teams team
WHERE team.id = membership.team_id;

ALTER TABLE team_members
    ALTER COLUMN organization_id SET NOT NULL,
    ADD CONSTRAINT team_members_organization_fk
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    ADD CONSTRAINT team_members_one_per_organization
        UNIQUE (organization_id, user_id);
