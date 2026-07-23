ALTER TABLE notifications
    ADD COLUMN created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN retracted_at timestamptz,
    ADD CONSTRAINT notifications_priority_range CHECK (priority BETWEEN 0 AND 2),
    ADD CONSTRAINT notifications_template_bounds CHECK (
        length(template) BETWEEN 1 AND 80
    ),
    ADD CONSTRAINT notifications_expiry_order CHECK (
        expires_at IS NULL OR expires_at > created_at
    ),
    ADD CONSTRAINT notifications_retraction_order CHECK (
        retracted_at IS NULL OR retracted_at >= created_at
    );

ALTER TABLE notification_receipts
    ADD CONSTRAINT notification_receipts_channel_known CHECK (
        channel IN ('in_app', 'email', 'discord', 'webhook')
    ),
    ADD CONSTRAINT notification_receipts_state_known CHECK (
        state IN ('delivered', 'read', 'failed')
    ),
    ADD CONSTRAINT notification_receipts_read_order CHECK (
        read_at IS NULL OR delivered_at IS NULL OR read_at >= delivered_at
    );

CREATE INDEX notifications_feed_idx
    ON notifications (organization_id, created_at DESC, id DESC)
    WHERE retracted_at IS NULL;

CREATE INDEX notifications_event_feed_idx
    ON notifications (organization_id, event_id, created_at DESC, id DESC)
    WHERE retracted_at IS NULL;

CREATE INDEX notification_receipts_user_idx
    ON notification_receipts (user_id, read_at, notification_id)
    WHERE channel = 'in_app';
