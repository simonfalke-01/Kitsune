//! Versioned events emitted for every meaningful state transition.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    identity::{
        ChallengeId, EventId, FlowId, InstanceId, NotificationId, OrganizationId, SubmissionId,
        SurveyResponseId, TeamId, UserId, WriteupId,
    },
    scoring::CompetitorId,
};

/// Immutable event envelope used by local and durable buses.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EventEnvelope {
    /// Globally unique idempotency key.
    pub id: Uuid,
    /// Schema version for the event payload.
    pub schema_version: u16,
    /// Owning organization, absent only for pre-tenant platform events such as
    /// a failed login against an unknown organization key.
    pub organization_id: Option<OrganizationId>,
    /// Optional event scope.
    pub event_id: Option<EventId>,
    /// Correlation ID spanning a command and its effects.
    pub correlation_id: Uuid,
    /// Actor, absent for system ticks.
    pub actor_id: Option<UserId>,
    /// Authoritative occurrence time.
    pub occurred_at: DateTime<Utc>,
    /// Typed event body.
    pub event: DomainEvent,
}

impl EventEnvelope {
    /// Wraps a domain event in a v1 envelope.
    pub fn new(
        organization_id: OrganizationId,
        event_id: Option<EventId>,
        actor_id: Option<UserId>,
        correlation_id: Uuid,
        occurred_at: DateTime<Utc>,
        event: DomainEvent,
    ) -> Self {
        Self {
            id: Uuid::now_v7(),
            schema_version: 1,
            organization_id: Some(organization_id),
            event_id,
            correlation_id,
            actor_id,
            occurred_at,
            event,
        }
    }

    /// Wraps a pre-tenant platform event without inventing an organization ID.
    pub fn new_platform(
        correlation_id: Uuid,
        occurred_at: DateTime<Utc>,
        event: DomainEvent,
    ) -> Self {
        Self {
            id: Uuid::now_v7(),
            schema_version: 1,
            organization_id: None,
            event_id: None,
            correlation_id,
            actor_id: None,
            occurred_at,
            event,
        }
    }

    /// Stable dotted event key used for subscriptions and automation triggers.
    pub fn kind(&self) -> &'static str {
        self.event.kind()
    }
}

/// Public event schema. Variants carry identifiers rather than secrets.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum DomainEvent {
    /// User identity created.
    UserCreated { user_id: UserId },
    /// Successful authentication.
    AuthenticationSucceeded { user_id: UserId, method: String },
    /// Failed authentication, deliberately without credential material.
    AuthenticationFailed {
        identity_hint: String,
        method: String,
    },
    /// Programmatic API credential lifecycle changed.
    ApiTokenChanged { token_id: Uuid, state: String },
    /// OAuth2 confidential-client lifecycle changed.
    OAuthClientChanged { client_id: Uuid, state: String },
    /// OpenID Connect provider lifecycle changed.
    OidcProviderChanged { provider_id: Uuid, state: String },
    /// SAML identity-provider lifecycle changed.
    SamlProviderChanged { provider_id: Uuid, state: String },
    /// Account-owned passkey lifecycle changed.
    PasskeyChanged { credential_id: Uuid, state: String },
    /// Event lifecycle or configuration changed.
    EventChanged { event_id: EventId },
    /// Team created.
    TeamCreated { team_id: TeamId },
    /// Team membership changed.
    TeamMembershipChanged { team_id: TeamId, user_id: UserId },
    /// Challenge lifecycle/configuration changed.
    ChallengeChanged { challenge_id: ChallengeId },
    /// A competitor revealed a hint and paid its one-time cost.
    HintUnlocked {
        challenge_id: ChallengeId,
        hint_id: u32,
        competitor: CompetitorId,
    },
    /// Player writeup draft or organizer review state changed.
    WriteupChanged {
        writeup_id: WriteupId,
        challenge_id: ChallengeId,
        state: String,
    },
    /// A competitor submitted or updated a post-solve survey.
    SurveySubmitted {
        response_id: SurveyResponseId,
        challenge_id: ChallengeId,
        competitor: CompetitorId,
    },
    /// Submission recorded.
    SubmissionReceived {
        submission_id: SubmissionId,
        challenge_id: ChallengeId,
        competitor: CompetitorId,
        outcome: SubmissionOutcome,
    },
    /// An organizer accepted or discarded a pending manual submission.
    SubmissionReviewed {
        submission_id: SubmissionId,
        challenge_id: ChallengeId,
        competitor: CompetitorId,
        accepted: bool,
    },
    /// First valid solve.
    FirstBlood {
        challenge_id: ChallengeId,
        competitor: CompetitorId,
    },
    /// Score ledger changed.
    ScoreChanged {
        competitor: CompetitorId,
        delta: i64,
    },
    /// Scoreboard visibility/freeze changed.
    ScoreboardControlChanged { frozen: bool, hidden: bool },
    /// KotH scoring tick completed.
    KothTickCompleted { tick: u64 },
    /// A&D tick completed.
    AttackDefenseTickCompleted { tick: u64 },
    /// Orchestrated instance lifecycle changed.
    InstanceChanged {
        instance_id: InstanceId,
        state: String,
    },
    /// Instance flag rotated; the secret value is never included.
    FlagRotated { instance_id: InstanceId, tick: u64 },
    /// Automation version activated.
    AutomationActivated { flow_id: FlowId, version: u32 },
    /// Automation execution completed.
    AutomationExecuted {
        flow_id: FlowId,
        version: u32,
        success: bool,
    },
    /// Operator configuration changed.
    ConfigurationChanged { keys: Vec<String> },
    /// Notification created.
    NotificationCreated { notification_id: NotificationId },
    /// Plugin lifecycle or grants changed.
    PluginChanged { plugin: String, state: String },
    /// Security/integrity review signal.
    IntegritySignal { signal: String, severity: u8 },
}

impl DomainEvent {
    /// Stable key independent of Serde representation details.
    pub const fn kind(&self) -> &'static str {
        match self {
            Self::UserCreated { .. } => "identity.user.created",
            Self::AuthenticationSucceeded { .. } => "auth.succeeded",
            Self::AuthenticationFailed { .. } => "auth.failed",
            Self::ApiTokenChanged { .. } => "auth.api_token.changed",
            Self::OAuthClientChanged { .. } => "auth.oauth_client.changed",
            Self::OidcProviderChanged { .. } => "auth.oidc_provider.changed",
            Self::SamlProviderChanged { .. } => "auth.saml_provider.changed",
            Self::PasskeyChanged { .. } => "auth.passkey.changed",
            Self::EventChanged { .. } => "event.changed",
            Self::TeamCreated { .. } => "identity.team.created",
            Self::TeamMembershipChanged { .. } => "identity.team.membership_changed",
            Self::ChallengeChanged { .. } => "challenge.changed",
            Self::HintUnlocked { .. } => "challenge.hint.unlocked",
            Self::WriteupChanged { .. } => "challenge.writeup.changed",
            Self::SurveySubmitted { .. } => "challenge.survey.submitted",
            Self::SubmissionReceived { .. } => "submission.received",
            Self::SubmissionReviewed { .. } => "submission.reviewed",
            Self::FirstBlood { .. } => "submission.first_blood",
            Self::ScoreChanged { .. } => "score.changed",
            Self::ScoreboardControlChanged { .. } => "scoreboard.control_changed",
            Self::KothTickCompleted { .. } => "koth.tick.completed",
            Self::AttackDefenseTickCompleted { .. } => "attack_defense.tick.completed",
            Self::InstanceChanged { .. } => "instance.changed",
            Self::FlagRotated { .. } => "instance.flag_rotated",
            Self::AutomationActivated { .. } => "automation.activated",
            Self::AutomationExecuted { .. } => "automation.executed",
            Self::ConfigurationChanged { .. } => "configuration.changed",
            Self::NotificationCreated { .. } => "notification.created",
            Self::PluginChanged { .. } => "plugin.changed",
            Self::IntegritySignal { .. } => "integrity.signal",
        }
    }
}

/// Stable submission result for API, audit, event, and integration consumers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubmissionOutcome {
    /// Accepted correct solution.
    Correct,
    /// Rejected solution.
    Incorrect,
    /// Partial credit or checker result.
    Partial,
    /// Queued for manual verification.
    Pending,
    /// Organizer discarded it.
    Discarded,
    /// Attempt budget was exceeded.
    RateLimited,
    /// Attack flag belongs to the submitting team.
    OwnFlag,
    /// Attack flag was previously accepted.
    Duplicate,
    /// Rotating flag is outside its validity window.
    Expired,
}

/// Immutable audit entry. Implementations enforce append-only persistence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AuditEntry {
    /// Unique record.
    pub id: Uuid,
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Optional event boundary.
    pub event_id: Option<EventId>,
    /// Actor if a person initiated the operation.
    pub actor_id: Option<UserId>,
    /// Stable operation key.
    pub action: String,
    /// Target kind.
    pub resource_type: String,
    /// Target identifier or safe key.
    pub resource_id: String,
    /// Safe structured context; secrets must be redacted before construction.
    pub metadata: serde_json::Value,
    /// Correlation ID.
    pub correlation_id: Uuid,
    /// Timestamp.
    pub occurred_at: DateTime<Utc>,
}
