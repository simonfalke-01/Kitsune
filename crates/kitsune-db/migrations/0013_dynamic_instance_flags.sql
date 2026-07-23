-- Dynamic challenge flags are high-entropy bearer secrets. Persist only their
-- digest and bind every active lease to exactly one scoring competitor.
ALTER TABLE instances
    ADD COLUMN flag_digest bytea,
    ADD COLUMN flag_generation bigint NOT NULL DEFAULT 0 CHECK (flag_generation >= 0),
    ADD COLUMN flag_rotated_at timestamptz,
    ADD CONSTRAINT instances_exactly_one_owner
        CHECK (num_nonnulls(user_id, team_id) = 1),
    ADD CONSTRAINT instances_flag_digest_length
        CHECK (flag_digest IS NULL OR octet_length(flag_digest) = 32);

CREATE UNIQUE INDEX instances_active_competitor_idx
    ON instances (event_id, challenge_id, user_id, team_id) NULLS NOT DISTINCT
    WHERE state IN ('requested', 'provisioning', 'ready', 'unhealthy', 'stopping');

CREATE INDEX instances_dynamic_verifier_idx
    ON instances (event_id, challenge_id, user_id, team_id, updated_at DESC)
    WHERE state IN ('ready', 'unhealthy') AND flag_digest IS NOT NULL;
