-- Survey definitions are versioned with the challenge aggregate. Responses
-- remain append-only in survey_responses.
ALTER TABLE challenges
    ADD COLUMN survey jsonb NOT NULL DEFAULT '[]'::jsonb;
