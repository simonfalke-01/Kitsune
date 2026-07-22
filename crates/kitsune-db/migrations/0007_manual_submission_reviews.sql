ALTER TABLE submissions
    ADD COLUMN answer_ciphertext bytea;

CREATE INDEX submissions_manual_review_queue_idx
    ON submissions (event_id, submitted_at, id)
    WHERE outcome = 'pending';
