ALTER TABLE writeups
    ADD CONSTRAINT writeups_competitor_exactly_one
        CHECK ((user_id IS NOT NULL)::integer + (team_id IS NOT NULL)::integer = 1),
    ADD CONSTRAINT writeups_body_not_blank
        CHECK (length(btrim(body)) > 0);

CREATE UNIQUE INDEX writeups_competitor_unique_idx
    ON writeups (challenge_id, user_id, team_id) NULLS NOT DISTINCT;

CREATE INDEX writeups_review_queue_idx
    ON writeups (state, updated_at DESC);

ALTER TABLE survey_responses
    ADD CONSTRAINT survey_responses_competitor_exactly_one
        CHECK ((user_id IS NOT NULL)::integer + (team_id IS NOT NULL)::integer = 1),
    ADD CONSTRAINT survey_responses_answers_object
        CHECK (jsonb_typeof(answers) = 'object');

CREATE UNIQUE INDEX survey_responses_competitor_unique_idx
    ON survey_responses (challenge_id, user_id, team_id) NULLS NOT DISTINCT;
