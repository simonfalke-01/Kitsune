-- The audit trail is append-only, including for direct database access through
-- the application role. Retention must use an explicit archival process owned
-- by a separately privileged operator rather than ordinary UPDATE/DELETE.
CREATE FUNCTION kitsune_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_log_reject_update_delete
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION kitsune_reject_audit_mutation();

DROP INDEX audit_log_org_time_idx;
CREATE INDEX audit_log_org_time_idx
    ON audit_log(organization_id, occurred_at DESC, id DESC);
CREATE INDEX audit_log_org_event_time_idx
    ON audit_log(organization_id, event_id, occurred_at DESC, id DESC);
CREATE INDEX audit_log_org_actor_time_idx
    ON audit_log(organization_id, actor_id, occurred_at DESC, id DESC);
CREATE INDEX audit_log_org_action_time_idx
    ON audit_log(organization_id, action, occurred_at DESC, id DESC);
