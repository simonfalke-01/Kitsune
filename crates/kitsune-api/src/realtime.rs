//! Authenticated WebSocket transport with SSE fallback.

use std::{collections::BTreeSet, convert::Infallible, time::Duration};

use axum::{
    extract::{State, WebSocketUpgrade, ws::Message},
    response::{IntoResponse, Sse, sse::Event},
};
use futures::{SinkExt, StreamExt, future};
use kitsune_core::{
    EventEnvelope,
    events::DomainEvent,
    identity::{OrganizationId, UserId},
};

use crate::{Actor, ApiResult, AppState};

const REALTIME_PERMISSIONS: [&str; 10] = [
    "audit_read",
    "automation_manage",
    "challenge_read",
    "event_read",
    "identity_manage",
    "instance_manage",
    "plugin_manage",
    "scoreboard_read",
    "submission_manage",
    "team_join",
];

/// Upgrades an authenticated realtime connection.
pub(crate) async fn websocket(
    State(state): State<AppState>,
    actor: Actor,
    upgrade: WebSocketUpgrade,
) -> ApiResult<impl IntoResponse> {
    actor.require("event_read")?;
    let audience = RealtimeAudience::from_actor(&actor);
    let bus = state.event_bus.clone();
    Ok(upgrade.on_upgrade(move |socket| async move {
        let Ok(mut events) = bus.subscribe(&[]).await else {
            return;
        };
        let (mut sender, mut receiver) = socket.split();
        loop {
            tokio::select! {
                event = events.next() => {
                    let Some(event) = event else {
                        break;
                    };
                    if !audience.allows(&event) {
                        continue;
                    }
                    let Ok(serialized) = serde_json::to_string(&event) else {
                        continue;
                    };
                    if sender.send(Message::Text(serialized.into())).await.is_err() {
                        break;
                    }
                }
                message = receiver.next() => {
                    let connection_closed = matches!(
                        &message,
                        Some(Ok(Message::Close(_)) | Err(_)) | None
                    );
                    if connection_closed {
                        break;
                    }

                    if let Some(Ok(Message::Ping(payload))) = message
                        && sender.send(Message::Pong(payload)).await.is_err()
                    {
                        break;
                    }
                }
            }
        }
    }))
}

/// Authenticated server-sent event fallback with keepalives.
pub(crate) async fn sse(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<impl IntoResponse> {
    actor.require("event_read")?;
    let audience = RealtimeAudience::from_actor(&actor);
    let events = state
        .event_bus
        .subscribe(&[])
        .await
        .map_err(crate::ApiError::from)?;
    let stream = events
        .filter_map(move |envelope| future::ready(audience.allows(&envelope).then_some(envelope)))
        .map(|envelope| {
            let event = Event::default()
                .id(envelope.id.to_string())
                .event(envelope.kind())
                .json_data(envelope)
                .unwrap_or_else(|_| Event::default().event("serialization_error"));
            Ok::<_, Infallible>(event)
        });
    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keepalive"),
    ))
}

#[derive(Debug, Clone)]
struct RealtimeAudience {
    organization_id: OrganizationId,
    user_id: UserId,
    permissions: BTreeSet<&'static str>,
}

impl RealtimeAudience {
    fn from_actor(actor: &Actor) -> Self {
        Self {
            organization_id: actor.session.account.organization_id,
            user_id: actor.session.account.user_id,
            permissions: REALTIME_PERMISSIONS
                .into_iter()
                .filter(|permission| actor.can(permission))
                .collect(),
        }
    }

    fn allows(&self, envelope: &EventEnvelope) -> bool {
        if envelope.organization_id != Some(self.organization_id) {
            return false;
        }
        let own_event = envelope.actor_id == Some(self.user_id);
        let required_permission = match &envelope.event {
            DomainEvent::UserCreated { user_id } | DomainEvent::UserChanged { user_id, .. }
                if *user_id == self.user_id =>
            {
                return true;
            }
            DomainEvent::AuthenticationSucceeded { user_id, .. } if *user_id == self.user_id => {
                return true;
            }
            DomainEvent::NotificationRead { user_id, .. } if *user_id == self.user_id => {
                return true;
            }
            DomainEvent::ApiTokenChanged { .. }
            | DomainEvent::OAuthClientChanged { .. }
            | DomainEvent::PasskeyChanged { .. }
                if own_event =>
            {
                return true;
            }
            DomainEvent::UserCreated { .. }
            | DomainEvent::UserChanged { .. }
            | DomainEvent::RoleChanged { .. }
            | DomainEvent::RoleGrantChanged { .. }
            | DomainEvent::OidcProviderChanged { .. }
            | DomainEvent::SamlProviderChanged { .. } => "identity_manage",
            DomainEvent::AuthenticationSucceeded { .. }
            | DomainEvent::AuthenticationFailed { .. }
            | DomainEvent::ApiTokenChanged { .. }
            | DomainEvent::OAuthClientChanged { .. }
            | DomainEvent::PasskeyChanged { .. }
            | DomainEvent::ConfigurationChanged { .. }
            | DomainEvent::IntegritySignal { .. }
            | DomainEvent::NotificationRead { .. } => "audit_read",
            DomainEvent::NotificationCreated { .. }
            | DomainEvent::NotificationRetracted { .. }
            | DomainEvent::EventChanged { .. }
            | DomainEvent::EventRegistrationChanged { .. } => "event_read",
            DomainEvent::TeamCreated { .. }
            | DomainEvent::TeamMembershipChanged { .. }
            | DomainEvent::TeamMemberTransferred { .. }
            | DomainEvent::TeamMerged { .. }
            | DomainEvent::TeamChanged { .. } => "team_join",
            DomainEvent::ChallengeChanged { .. } | DomainEvent::HintUnlocked { .. } => {
                "challenge_read"
            }
            DomainEvent::WriteupChanged { .. }
            | DomainEvent::SurveySubmitted { .. }
            | DomainEvent::SubmissionReceived { .. }
            | DomainEvent::SubmissionReviewed { .. } => "submission_manage",
            DomainEvent::FirstBlood { .. }
            | DomainEvent::ScoreChanged { .. }
            | DomainEvent::ScoreboardControlChanged { .. }
            | DomainEvent::KothTickCompleted { .. }
            | DomainEvent::AttackDefenseTickCompleted { .. } => "scoreboard_read",
            DomainEvent::InstanceChanged { .. } | DomainEvent::FlagRotated { .. } => {
                "instance_manage"
            }
            DomainEvent::AutomationActivated { .. } | DomainEvent::AutomationExecuted { .. } => {
                "automation_manage"
            }
            DomainEvent::PluginChanged { .. } => "plugin_manage",
        };
        self.permissions.contains(required_permission)
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use kitsune_core::{
        EventEnvelope,
        events::{DomainEvent, SubmissionOutcome},
        identity::{ChallengeId, OrganizationId, SubmissionId, UserId},
        scoring::CompetitorId,
    };
    use uuid::Uuid;

    use super::RealtimeAudience;

    #[test]
    fn realtime_events_are_tenant_and_permission_filtered() {
        let organization_id = OrganizationId::new();
        let user_id = UserId::new();
        let player = RealtimeAudience {
            organization_id,
            user_id,
            permissions: ["event_read", "scoreboard_read"].into_iter().collect(),
        };
        let score = envelope(
            organization_id,
            Some(user_id),
            DomainEvent::ScoreChanged {
                competitor: CompetitorId::User(user_id),
                delta: 100,
            },
        );
        assert!(player.allows(&score));

        let other_tenant = envelope(
            OrganizationId::new(),
            Some(user_id),
            DomainEvent::ScoreChanged {
                competitor: CompetitorId::User(user_id),
                delta: 100,
            },
        );
        assert!(!player.allows(&other_tenant));

        let submission = envelope(
            organization_id,
            Some(UserId::new()),
            DomainEvent::SubmissionReceived {
                submission_id: SubmissionId::new(),
                challenge_id: ChallengeId::new(),
                competitor: CompetitorId::User(UserId::new()),
                outcome: SubmissionOutcome::Incorrect,
            },
        );
        assert!(!player.allows(&submission));

        let platform_event = EventEnvelope::new_platform(
            Uuid::now_v7(),
            Utc::now(),
            DomainEvent::AuthenticationFailed {
                identity_hint: "redacted-digest".into(),
                method: "local".into(),
            },
        );
        assert!(!player.allows(&platform_event));
    }

    #[test]
    fn account_events_are_visible_only_to_the_owner_or_auditor() {
        let organization_id = OrganizationId::new();
        let user_id = UserId::new();
        let owner = RealtimeAudience {
            organization_id,
            user_id,
            permissions: ["event_read"].into_iter().collect(),
        };
        let own_change = envelope(
            organization_id,
            Some(user_id),
            DomainEvent::PasskeyChanged {
                credential_id: Uuid::now_v7(),
                state: "created".into(),
            },
        );
        assert!(owner.allows(&own_change));

        let other_change = envelope(
            organization_id,
            Some(UserId::new()),
            DomainEvent::PasskeyChanged {
                credential_id: Uuid::now_v7(),
                state: "created".into(),
            },
        );
        assert!(!owner.allows(&other_change));

        let auditor = RealtimeAudience {
            permissions: ["audit_read", "event_read"].into_iter().collect(),
            ..owner
        };
        assert!(auditor.allows(&other_change));
    }

    fn envelope(
        organization_id: OrganizationId,
        actor_id: Option<UserId>,
        event: DomainEvent,
    ) -> EventEnvelope {
        EventEnvelope::new(
            organization_id,
            None,
            actor_id,
            Uuid::now_v7(),
            Utc::now(),
            event,
        )
    }
}
