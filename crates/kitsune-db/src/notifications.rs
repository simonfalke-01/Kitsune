//! Durable in-app notifications and organizer announcement broadcasts.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    events::DomainEvent,
    identity::{EventId, NotificationId, OrganizationId, UserId},
};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::resources::persist_audit_event;

/// Stable descending notification-feed cursor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NotificationCursor {
    pub created_at: DateTime<Utc>,
    pub id: Uuid,
}

/// Player-visible in-app notification projection.
#[derive(Debug, Clone, PartialEq)]
pub struct NotificationFeedItem {
    pub id: Uuid,
    pub event_id: Option<Uuid>,
    pub template: String,
    pub data: Value,
    pub priority: i16,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub read_at: Option<DateTime<Utc>>,
}

/// One keyset-paginated notification page.
#[derive(Debug, Clone, PartialEq)]
pub struct NotificationPage {
    pub items: Vec<NotificationFeedItem>,
    pub unread_count: i64,
    pub next_cursor: Option<NotificationCursor>,
}

/// Organizer-visible announcement history record.
#[derive(Debug, Clone, PartialEq)]
pub struct AnnouncementRecord {
    pub id: Uuid,
    pub event_id: Option<Uuid>,
    pub created_by: Option<Uuid>,
    pub data: Value,
    pub priority: i16,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub retracted_at: Option<DateTime<Utc>>,
}

/// New announcement command.
pub struct CreateAnnouncement<'a> {
    pub organization_id: OrganizationId,
    pub actor: UserId,
    pub announcement_id: NotificationId,
    pub event_id: Option<EventId>,
    pub data: &'a Value,
    pub priority: i16,
    pub expires_at: Option<DateTime<Utc>>,
    pub now: DateTime<Utc>,
}

/// PostgreSQL notification repository.
#[derive(Debug, Clone)]
pub struct NotificationRepository {
    pool: PgPool,
}

impl NotificationRepository {
    /// Wraps an existing connection pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Reads and marks delivered a bounded page visible to one user.
    pub async fn feed(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
        cursor: Option<NotificationCursor>,
        limit: u16,
        now: DateTime<Utc>,
    ) -> DomainResult<NotificationPage> {
        if limit == 0 || limit > 100 {
            return Err(DomainError::Validation(
                "notification page limit must be between 1 and 100".into(),
            ));
        }
        let cursor_time = cursor.map(|value| value.created_at);
        let cursor_id = cursor.map(|value| value.id);
        let row_limit = i64::from(limit) + 1;
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let mut items = sqlx::query_as!(
            NotificationFeedItem,
            r#"
            SELECT
                n.id,
                n.event_id,
                n.template,
                n.data,
                n.priority,
                n.created_at,
                n.expires_at,
                receipt.read_at
            FROM notifications n
            LEFT JOIN notification_receipts receipt
              ON receipt.notification_id = n.id
             AND receipt.user_id = $2
             AND receipt.channel = 'in_app'
            WHERE n.organization_id = $1
              AND n.retracted_at IS NULL
              AND n.audience_id IS NULL
              AND (n.expires_at IS NULL OR n.expires_at > $3)
              AND (
                    n.recipient_user_id = $2
                    OR (
                        n.recipient_user_id IS NULL
                        AND (
                            n.event_id IS NULL
                            OR EXISTS (
                                SELECT 1
                                FROM role_grants grant_row
                                JOIN roles role_row ON role_row.id = grant_row.role_id
                                WHERE grant_row.organization_id = $1
                                  AND grant_row.user_id = $2
                                  AND grant_row.team_id IS NULL
                                  AND (
                                      grant_row.event_id IS NULL
                                      OR grant_row.event_id = n.event_id
                                  )
                                  AND (
                                      'event_read' = ANY(role_row.permissions)
                                      OR 'platform_manage' = ANY(role_row.permissions)
                                  )
                            )
                        )
                    )
              )
              AND (
                    $4::timestamptz IS NULL
                    OR (n.created_at, n.id) < ($4, $5)
              )
            ORDER BY n.created_at DESC, n.id DESC
            LIMIT $6
            "#,
            organization_id.0,
            user_id.0,
            now,
            cursor_time,
            cursor_id,
            row_limit,
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(unavailable)?;
        let has_more = items.len() > usize::from(limit);
        items.truncate(usize::from(limit));

        let delivered_ids = items.iter().map(|item| item.id).collect::<Vec<_>>();
        if !delivered_ids.is_empty() {
            sqlx::query!(
                r#"
                INSERT INTO notification_receipts (
                    notification_id,user_id,channel,state,delivered_at,read_at,error
                )
                SELECT id,$2,'in_app','delivered',$3,NULL,NULL
                FROM UNNEST($1::uuid[]) AS id
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM notification_receipts existing
                    WHERE existing.notification_id = id
                      AND existing.user_id = $2
                      AND existing.channel = 'in_app'
                )
                ON CONFLICT (notification_id,user_id,channel) DO NOTHING
                "#,
                &delivered_ids,
                user_id.0,
                now,
            )
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        }

        let unread_count = visible_unread_count(&mut tx, organization_id, user_id, now).await?;
        tx.commit().await.map_err(unavailable)?;
        let next_cursor = has_more.then(|| {
            let last = items
                .last()
                .expect("a notification page with a successor is non-empty");
            NotificationCursor {
                created_at: last.created_at,
                id: last.id,
            }
        });
        Ok(NotificationPage {
            items,
            unread_count,
            next_cursor,
        })
    }

    /// Idempotently marks one visible in-app notification read.
    pub async fn mark_read(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
        notification_id: NotificationId,
        now: DateTime<Utc>,
    ) -> DomainResult<Option<EventEnvelope>> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let event_id = sqlx::query_scalar!(
            r#"
            SELECT n.event_id
            FROM notifications n
            WHERE n.id = $1
              AND n.organization_id = $2
              AND n.retracted_at IS NULL
              AND n.audience_id IS NULL
              AND (n.expires_at IS NULL OR n.expires_at > $4)
              AND (
                    n.recipient_user_id = $3
                    OR (
                        n.recipient_user_id IS NULL
                        AND (
                            n.event_id IS NULL
                            OR EXISTS (
                                SELECT 1
                                FROM role_grants grant_row
                                JOIN roles role_row ON role_row.id = grant_row.role_id
                                WHERE grant_row.organization_id = $2
                                  AND grant_row.user_id = $3
                                  AND grant_row.team_id IS NULL
                                  AND (
                                      grant_row.event_id IS NULL
                                      OR grant_row.event_id = n.event_id
                                  )
                                  AND (
                                      'event_read' = ANY(role_row.permissions)
                                      OR 'platform_manage' = ANY(role_row.permissions)
                                  )
                            )
                        )
                    )
              )
            FOR SHARE
            "#,
            notification_id.0,
            organization_id.0,
            user_id.0,
            now,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        let receipt = sqlx::query!(
            r#"
            INSERT INTO notification_receipts (
                notification_id,user_id,channel,state,delivered_at,read_at,error
            ) VALUES ($1,$2,'in_app','read',$3,$3,NULL)
            ON CONFLICT (notification_id,user_id,channel) DO UPDATE SET
                state = 'read',
                delivered_at = COALESCE(notification_receipts.delivered_at, EXCLUDED.delivered_at),
                read_at = COALESCE(notification_receipts.read_at, EXCLUDED.read_at),
                error = NULL
            WHERE notification_receipts.read_at IS NULL
            "#,
            notification_id.0,
            user_id.0,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        if receipt.rows_affected() == 0 {
            tx.commit().await.map_err(unavailable)?;
            return Ok(None);
        }
        let envelope = EventEnvelope::new(
            organization_id,
            event_id.map(EventId),
            Some(user_id),
            Uuid::now_v7(),
            now,
            DomainEvent::NotificationRead {
                notification_id,
                user_id,
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "notification.read",
            "notification",
            &notification_id.0.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(Some(envelope))
    }

    /// Creates a durable organization or event announcement.
    pub async fn create_announcement(
        &self,
        command: CreateAnnouncement<'_>,
    ) -> DomainResult<(AnnouncementRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        if let Some(event_id) = command.event_id {
            sqlx::query_scalar!(
                "SELECT id FROM events WHERE id = $1 AND organization_id = $2 FOR SHARE",
                event_id.0,
                command.organization_id.0,
            )
            .fetch_optional(&mut *tx)
            .await
            .map_err(unavailable)?
            .ok_or(DomainError::NotFound)?;
        }
        let record = sqlx::query_as!(
            AnnouncementRecord,
            r#"
            INSERT INTO notifications (
                id,organization_id,event_id,recipient_user_id,audience_id,template,
                data,priority,created_at,expires_at,created_by,retracted_at
            ) VALUES ($1,$2,$3,NULL,NULL,'announcement',$4,$5,$6,$7,$8,NULL)
            RETURNING id,event_id,created_by,data,priority,created_at,expires_at,retracted_at
            "#,
            command.announcement_id.0,
            command.organization_id.0,
            command.event_id.map(|id| id.0),
            command.data,
            command.priority,
            command.now,
            command.expires_at,
            command.actor.0,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let envelope = EventEnvelope::new(
            command.organization_id,
            command.event_id,
            Some(command.actor),
            Uuid::now_v7(),
            command.now,
            DomainEvent::NotificationCreated {
                notification_id: command.announcement_id,
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "announcement.create",
            "notification",
            &command.announcement_id.0.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((record, envelope))
    }

    /// Lists recent organizer announcement history, including retractions.
    pub async fn announcements(
        &self,
        organization_id: OrganizationId,
        limit: u16,
    ) -> DomainResult<Vec<AnnouncementRecord>> {
        if limit == 0 || limit > 250 {
            return Err(DomainError::Validation(
                "announcement history limit must be between 1 and 250".into(),
            ));
        }
        sqlx::query_as!(
            AnnouncementRecord,
            r#"
            SELECT id,event_id,created_by,data,priority,created_at,expires_at,retracted_at
            FROM notifications
            WHERE organization_id = $1 AND template = 'announcement'
            ORDER BY created_at DESC,id DESC
            LIMIT $2
            "#,
            organization_id.0,
            i64::from(limit),
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Retracts a live announcement without erasing its audit history.
    pub async fn retract_announcement(
        &self,
        organization_id: OrganizationId,
        actor: UserId,
        notification_id: NotificationId,
        now: DateTime<Utc>,
    ) -> DomainResult<EventEnvelope> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let event_id = sqlx::query_scalar!(
            r#"
            UPDATE notifications
            SET retracted_at = $3
            WHERE id = $1 AND organization_id = $2 AND template = 'announcement'
              AND retracted_at IS NULL
            RETURNING event_id
            "#,
            notification_id.0,
            organization_id.0,
            now,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        let envelope = EventEnvelope::new(
            organization_id,
            event_id.map(EventId),
            Some(actor),
            Uuid::now_v7(),
            now,
            DomainEvent::NotificationRetracted { notification_id },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "announcement.retract",
            "notification",
            &notification_id.0.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(envelope)
    }
}

async fn visible_unread_count(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    organization_id: OrganizationId,
    user_id: UserId,
    now: DateTime<Utc>,
) -> DomainResult<i64> {
    sqlx::query_scalar!(
        r#"
        SELECT COUNT(*) AS "count!"
        FROM notifications n
        LEFT JOIN notification_receipts receipt
          ON receipt.notification_id = n.id
         AND receipt.user_id = $2
         AND receipt.channel = 'in_app'
        WHERE n.organization_id = $1
          AND n.retracted_at IS NULL
          AND n.audience_id IS NULL
          AND (n.expires_at IS NULL OR n.expires_at > $3)
          AND receipt.read_at IS NULL
          AND (
                n.recipient_user_id = $2
                OR (
                    n.recipient_user_id IS NULL
                    AND (
                        n.event_id IS NULL
                        OR EXISTS (
                            SELECT 1
                            FROM role_grants grant_row
                            JOIN roles role_row ON role_row.id = grant_row.role_id
                            WHERE grant_row.organization_id = $1
                              AND grant_row.user_id = $2
                              AND grant_row.team_id IS NULL
                              AND (
                                  grant_row.event_id IS NULL
                                  OR grant_row.event_id = n.event_id
                              )
                              AND (
                                  'event_read' = ANY(role_row.permissions)
                                  OR 'platform_manage' = ANY(role_row.permissions)
                              )
                        )
                    )
                )
          )
        "#,
        organization_id.0,
        user_id.0,
        now,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if let sqlx::Error::Database(database) = &error
        && database.is_unique_violation()
    {
        return DomainError::Conflict("notification already exists".into());
    }
    unavailable(error)
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres notifications: {error}"))
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use kitsune_core::{
        DomainError,
        identity::{EventId, NotificationId, OrganizationId, UserId},
    };
    use serde_json::json;
    use sqlx::PgPool;
    use uuid::Uuid;

    use super::{CreateAnnouncement, NotificationRepository};
    use crate::MIGRATOR;

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn announcements_are_visible_delivered_read_and_retracted(pool: PgPool) {
        let organization_id = OrganizationId::new();
        let actor = UserId::new();
        let recipient = UserId::new();
        let event_id = EventId::new();
        let role_id = Uuid::now_v7();
        let now = Utc::now();
        seed_fixture(
            &pool,
            organization_id,
            actor,
            recipient,
            event_id,
            role_id,
            now,
        )
        .await;
        let repository = NotificationRepository::new(pool.clone());
        let organization_data = json!({"title": "Platform notice"});
        let event_data = json!({"title": "Event notice"});

        let (organization_announcement, _) = repository
            .create_announcement(CreateAnnouncement {
                organization_id,
                actor,
                announcement_id: NotificationId::new(),
                event_id: None,
                data: &organization_data,
                priority: 1,
                now,
                expires_at: None,
            })
            .await
            .expect("organization announcement");
        let event_time = now + Duration::seconds(1);
        let (event_announcement, _) = repository
            .create_announcement(CreateAnnouncement {
                organization_id,
                actor,
                announcement_id: NotificationId::new(),
                event_id: Some(event_id),
                data: &event_data,
                priority: 2,
                now: event_time,
                expires_at: Some(event_time + Duration::hours(1)),
            })
            .await
            .expect("event announcement");

        let first_page = repository
            .feed(
                organization_id,
                recipient,
                None,
                1,
                event_time + Duration::seconds(1),
            )
            .await
            .expect("first feed page");
        assert_eq!(first_page.items.len(), 1);
        assert_eq!(first_page.items[0].id, event_announcement.id);
        assert_eq!(first_page.unread_count, 2);
        let second_page = repository
            .feed(
                organization_id,
                recipient,
                first_page.next_cursor,
                1,
                event_time + Duration::seconds(1),
            )
            .await
            .expect("second feed page");
        assert_eq!(second_page.items.len(), 1);
        assert_eq!(second_page.items[0].id, organization_announcement.id);
        assert!(second_page.next_cursor.is_none());

        let read_event = repository
            .mark_read(
                organization_id,
                recipient,
                NotificationId(event_announcement.id),
                event_time + Duration::seconds(2),
            )
            .await
            .expect("mark read");
        assert!(read_event.is_some());
        let duplicate_read = repository
            .mark_read(
                organization_id,
                recipient,
                NotificationId(event_announcement.id),
                event_time + Duration::seconds(3),
            )
            .await
            .expect("idempotent mark read");
        assert!(duplicate_read.is_none());
        let read_feed = repository
            .feed(
                organization_id,
                recipient,
                None,
                10,
                event_time + Duration::seconds(3),
            )
            .await
            .expect("read feed");
        assert_eq!(read_feed.unread_count, 1);

        let announcement_history = repository
            .announcements(organization_id, 10)
            .await
            .expect("announcement history");
        assert_eq!(announcement_history.len(), 2);
        repository
            .retract_announcement(
                organization_id,
                actor,
                NotificationId(event_announcement.id),
                event_time + Duration::seconds(4),
            )
            .await
            .expect("retract announcement");
        let remaining_feed = repository
            .feed(
                organization_id,
                recipient,
                None,
                10,
                event_time + Duration::seconds(5),
            )
            .await
            .expect("remaining feed");
        assert_eq!(remaining_feed.items.len(), 1);
        assert_eq!(remaining_feed.items[0].id, organization_announcement.id);
        assert!(matches!(
            repository
                .retract_announcement(
                    organization_id,
                    actor,
                    NotificationId(event_announcement.id),
                    event_time + Duration::seconds(6),
                )
                .await,
            Err(DomainError::NotFound)
        ));

        let event_count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM event_outbox WHERE organization_id = $1",
        )
        .bind(organization_id.0)
        .fetch_one(&pool)
        .await
        .expect("event count");
        let audit_count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM audit_log WHERE organization_id = $1",
        )
        .bind(organization_id.0)
        .fetch_one(&pool)
        .await
        .expect("audit count");
        assert_eq!(event_count, 4);
        assert_eq!(audit_count, 4);
    }

    #[allow(clippy::too_many_arguments)]
    async fn seed_fixture(
        pool: &PgPool,
        organization_id: OrganizationId,
        actor: UserId,
        recipient: UserId,
        event_id: EventId,
        role_id: Uuid,
        now: chrono::DateTime<Utc>,
    ) {
        sqlx::query("INSERT INTO organizations (id,name,slug,created_at) VALUES ($1,$2,$3,$4)")
            .bind(organization_id.0)
            .bind("Notification Test")
            .bind(format!("notification-{organization_id}"))
            .bind(now)
            .execute(pool)
            .await
            .expect("organization");
        for (user_id, email, name) in [
            (actor, "notification-admin@example.test", "Admin"),
            (recipient, "notification-user@example.test", "Player"),
        ] {
            sqlx::query(
                r"
                INSERT INTO users (
                    id,organization_id,email,email_normalized,display_name,email_verified,
                    disabled,custom_fields,created_at,updated_at
                ) VALUES ($1,$2,$3,$3,$4,true,false,'{}',$5,$5)
                ",
            )
            .bind(user_id.0)
            .bind(organization_id.0)
            .bind(email)
            .bind(name)
            .bind(now)
            .execute(pool)
            .await
            .expect("user");
        }
        sqlx::query(
            r"
            INSERT INTO events (
                id,organization_id,name,slug,state,participation,modes,created_at,updated_at
            ) VALUES ($1,$2,'Notification Event',$3,'live','individual',$4,$5,$5)
            ",
        )
        .bind(event_id.0)
        .bind(organization_id.0)
        .bind(format!("notification-event-{event_id}"))
        .bind(vec!["jeopardy".to_owned()])
        .bind(now)
        .execute(pool)
        .await
        .expect("event");
        sqlx::query(
            r"
            INSERT INTO roles (id,organization_id,key,name,permissions,built_in)
            VALUES ($1,$2,'notification_reader','Notification Reader',$3,false)
            ",
        )
        .bind(role_id)
        .bind(organization_id.0)
        .bind(vec!["event_read".to_owned()])
        .execute(pool)
        .await
        .expect("role");
        sqlx::query(
            r"
            INSERT INTO role_grants (
                id,user_id,role_id,organization_id,event_id,team_id,granted_by,granted_at
            ) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7)
            ",
        )
        .bind(Uuid::now_v7())
        .bind(recipient.0)
        .bind(role_id)
        .bind(organization_id.0)
        .bind(event_id.0)
        .bind(actor.0)
        .bind(now)
        .execute(pool)
        .await
        .expect("role grant");
    }
}
