-- Preserve exact idempotent submission receipts without retaining answers.
ALTER TABLE submissions
    ADD COLUMN awarded_points bigint NOT NULL DEFAULT 0,
    ADD COLUMN first_blood boolean NOT NULL DEFAULT false,
    ADD COLUMN attempts_remaining integer;

CREATE SEQUENCE score_entry_sequence AS bigint;

CREATE INDEX challenge_solves_challenge_time_idx
    ON challenge_solves (challenge_id, solved_at);

CREATE INDEX score_entries_competitor_idx
    ON score_entries (event_id, team_id, user_id, occurred_at);
