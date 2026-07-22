//! Typed directed-acyclic automation graph validation and execution.

use std::collections::{BTreeMap, BTreeSet, VecDeque};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    identity::{FlowId, OrganizationId},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Versioned automation flow.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutomationGraph {
    /// Flow identifier.
    pub id: FlowId,
    /// Tenant boundary.
    pub organization_id: OrganizationId,
    /// Human-readable name.
    pub name: String,
    /// Monotonic published version.
    pub version: u32,
    /// Node map.
    pub nodes: BTreeMap<String, AutomationNode>,
    /// Directed transitions.
    pub edges: Vec<AutomationEdge>,
}

/// One typed graph node.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutomationNode {
    /// Stable node ID within a version.
    pub id: String,
    /// Human-readable label.
    pub label: String,
    /// Node behavior.
    pub kind: AutomationNodeKind,
}

/// Built-in trigger, condition, and action nodes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AutomationNodeKind {
    /// Starts when a stable event key matches.
    Trigger {
        /// Empty subscribes to all event types.
        event_kinds: Vec<String>,
    },
    /// Compares a JSON pointer in the event envelope.
    Condition {
        /// RFC 6901 JSON pointer.
        pointer: String,
        /// Comparison.
        operator: ConditionOperator,
        /// Optional comparison value.
        value: Option<serde_json::Value>,
    },
    /// Delegates a typed action to the server's action registry.
    Action {
        /// Stable action key.
        action: String,
        /// Schema-validated configuration.
        config: serde_json::Value,
    },
}

/// Supported safe condition comparisons.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConditionOperator {
    /// Values compare equal.
    Equals,
    /// Values do not compare equal.
    NotEquals,
    /// Pointer resolves to a value.
    Exists,
    /// String contains configured string.
    Contains,
    /// Numeric value is greater than configured numeric value.
    GreaterThan,
    /// Numeric value is less than configured numeric value.
    LessThan,
}

/// Transition activation rule.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeWhen {
    /// Always follow after successful execution.
    Success,
    /// Follow only when a condition evaluated true.
    True,
    /// Follow only when a condition evaluated false.
    False,
}

/// Directed edge.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutomationEdge {
    /// Source node.
    pub from: String,
    /// Destination node.
    pub to: String,
    /// Activation rule.
    pub when: EdgeWhen,
}

impl AutomationGraph {
    /// Validates node IDs, one trigger root, known endpoints, and acyclicity.
    pub fn validate(&self) -> DomainResult<Vec<String>> {
        if self.name.trim().is_empty() || self.version == 0 || self.nodes.is_empty() {
            return Err(DomainError::Validation(
                "flow name, positive version, and nodes are required".into(),
            ));
        }
        if self.nodes.iter().any(|(id, node)| {
            id != &node.id || id.is_empty() || id.len() > 80 || node.label.trim().is_empty()
        }) {
            return Err(DomainError::Validation(
                "node IDs and labels must be valid".into(),
            ));
        }
        let triggers: Vec<_> = self
            .nodes
            .values()
            .filter(|node| matches!(node.kind, AutomationNodeKind::Trigger { .. }))
            .collect();
        if triggers.len() != 1 {
            return Err(DomainError::Validation(
                "flow must contain exactly one trigger".into(),
            ));
        }
        let mut indegree: BTreeMap<String, usize> =
            self.nodes.keys().map(|id| (id.clone(), 0)).collect();
        let mut adjacency: BTreeMap<String, Vec<String>> = BTreeMap::new();
        let mut unique_edges = BTreeSet::new();
        for edge in &self.edges {
            if !self.nodes.contains_key(&edge.from) || !self.nodes.contains_key(&edge.to) {
                return Err(DomainError::Validation(
                    "edge refers to an unknown node".into(),
                ));
            }
            if !unique_edges.insert((edge.from.clone(), edge.to.clone(), edge.when)) {
                return Err(DomainError::Validation("duplicate edge".into()));
            }
            *indegree.get_mut(&edge.to).expect("known node") += 1;
            adjacency
                .entry(edge.from.clone())
                .or_default()
                .push(edge.to.clone());
        }
        let trigger_id = triggers[0].id.clone();
        if indegree[&trigger_id] != 0 {
            return Err(DomainError::Validation(
                "trigger cannot have incoming edges".into(),
            ));
        }
        let mut queue: VecDeque<_> = indegree
            .iter()
            .filter(|(_, degree)| **degree == 0)
            .map(|(id, _)| id.clone())
            .collect();
        let mut order = Vec::with_capacity(self.nodes.len());
        while let Some(id) = queue.pop_front() {
            order.push(id.clone());
            for next in adjacency.get(&id).into_iter().flatten() {
                let degree = indegree.get_mut(next).expect("known node");
                *degree -= 1;
                if *degree == 0 {
                    queue.push_back(next.clone());
                }
            }
        }
        if order.len() != self.nodes.len() {
            return Err(DomainError::Validation("flow contains a cycle".into()));
        }
        Ok(order)
    }

    /// Returns whether the trigger subscribes to an event.
    pub fn accepts(&self, event: &EventEnvelope) -> bool {
        self.nodes.values().any(|node| {
            if let AutomationNodeKind::Trigger { event_kinds } = &node.kind {
                event_kinds.is_empty() || event_kinds.iter().any(|kind| kind == event.kind())
            } else {
                false
            }
        })
    }
}

/// Action execution seam used by webhooks, Discord, mail, scoring,
/// orchestration, configuration, and plugin actions.
#[async_trait]
pub trait ActionExecutor: Send + Sync {
    /// Executes a registered action with already schema-validated configuration.
    async fn execute(
        &self,
        action: &str,
        config: &serde_json::Value,
        event: &EventEnvelope,
        idempotency_key: Uuid,
    ) -> DomainResult<serde_json::Value>;
}

/// Final run status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    /// Event did not match the trigger.
    Skipped,
    /// Every activated node succeeded.
    Succeeded,
    /// A node failed and execution stopped.
    Failed,
    /// Dry-run validated and traced without side effects.
    DryRun,
}

/// Per-node execution log.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NodeRun {
    /// Node ID.
    pub node_id: String,
    /// Whether it was activated.
    pub activated: bool,
    /// Condition value, if applicable.
    pub condition: Option<bool>,
    /// Safe output or diagnostic.
    pub output: serde_json::Value,
    /// Duration in milliseconds.
    pub duration_ms: u64,
}

/// Persistable flow execution result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutomationRun {
    /// Run identifier.
    pub id: Uuid,
    /// Flow.
    pub flow_id: FlowId,
    /// Version.
    pub version: u32,
    /// Triggering event.
    pub event_id: Uuid,
    /// Run status.
    pub status: RunStatus,
    /// Node trace.
    pub nodes: Vec<NodeRun>,
    /// Start.
    pub started_at: DateTime<Utc>,
    /// Completion.
    pub completed_at: DateTime<Utc>,
}

/// Bounded DAG runner.
pub struct AutomationEngine<E> {
    executor: E,
    maximum_nodes: usize,
}

impl<E: ActionExecutor> AutomationEngine<E> {
    /// Creates an engine with a hard per-flow node budget.
    pub fn new(executor: E, maximum_nodes: usize) -> DomainResult<Self> {
        if !(1..=1_000).contains(&maximum_nodes) {
            return Err(DomainError::Validation(
                "automation node budget must be between 1 and 1000".into(),
            ));
        }
        Ok(Self {
            executor,
            maximum_nodes,
        })
    }

    /// Executes or dry-runs a published graph.
    pub async fn run(
        &self,
        graph: &AutomationGraph,
        event: &EventEnvelope,
        dry_run: bool,
    ) -> DomainResult<AutomationRun> {
        if graph.nodes.len() > self.maximum_nodes {
            return Err(DomainError::LimitExceeded("automation node budget".into()));
        }
        let order = graph.validate()?;
        let started_at = Utc::now();
        if !graph.accepts(event) {
            return Ok(AutomationRun {
                id: Uuid::now_v7(),
                flow_id: graph.id,
                version: graph.version,
                event_id: event.id,
                status: RunStatus::Skipped,
                nodes: Vec::new(),
                started_at,
                completed_at: Utc::now(),
            });
        }
        let envelope = serde_json::to_value(event)
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        let trigger_id = graph
            .nodes
            .values()
            .find(|node| matches!(node.kind, AutomationNodeKind::Trigger { .. }))
            .expect("validated trigger")
            .id
            .clone();
        let mut activated = BTreeSet::from([trigger_id]);
        let mut condition_results = BTreeMap::new();
        let mut runs = Vec::new();
        let run_id = Uuid::now_v7();
        let mut status = if dry_run {
            RunStatus::DryRun
        } else {
            RunStatus::Succeeded
        };

        for node_id in order {
            let node = &graph.nodes[&node_id];
            let is_active = activated.contains(&node_id);
            let node_started = std::time::Instant::now();
            let mut condition = None;
            let output = if is_active {
                match &node.kind {
                    AutomationNodeKind::Trigger { .. } => serde_json::json!({"matched": true}),
                    AutomationNodeKind::Condition {
                        pointer,
                        operator,
                        value,
                    } => {
                        let result =
                            evaluate_condition(&envelope, pointer, *operator, value.as_ref());
                        condition = Some(result);
                        condition_results.insert(node_id.clone(), result);
                        serde_json::json!({"result": result})
                    }
                    AutomationNodeKind::Action { action, config } if dry_run => {
                        serde_json::json!({"would_execute": action, "config_valid": !config.is_null()})
                    }
                    AutomationNodeKind::Action { action, config } => {
                        match self.executor.execute(action, config, event, run_id).await {
                            Ok(output) => output,
                            Err(error) => {
                                status = RunStatus::Failed;
                                serde_json::json!({"error": error.to_string()})
                            }
                        }
                    }
                }
            } else {
                serde_json::json!({"skipped": true})
            };
            runs.push(NodeRun {
                node_id: node_id.clone(),
                activated: is_active,
                condition,
                output,
                duration_ms: u64::try_from(node_started.elapsed().as_millis()).unwrap_or(u64::MAX),
            });
            if status == RunStatus::Failed {
                break;
            }
            if is_active {
                for edge in graph.edges.iter().filter(|edge| edge.from == node_id) {
                    let follow = match edge.when {
                        EdgeWhen::Success => true,
                        EdgeWhen::True => condition_results.get(&node_id) == Some(&true),
                        EdgeWhen::False => condition_results.get(&node_id) == Some(&false),
                    };
                    if follow {
                        activated.insert(edge.to.clone());
                    }
                }
            }
        }

        Ok(AutomationRun {
            id: run_id,
            flow_id: graph.id,
            version: graph.version,
            event_id: event.id,
            status,
            nodes: runs,
            started_at,
            completed_at: Utc::now(),
        })
    }
}

fn evaluate_condition(
    document: &serde_json::Value,
    pointer: &str,
    operator: ConditionOperator,
    expected: Option<&serde_json::Value>,
) -> bool {
    let actual = document.pointer(pointer);
    match operator {
        ConditionOperator::Exists => actual.is_some(),
        ConditionOperator::Equals => actual == expected,
        ConditionOperator::NotEquals => actual != expected,
        ConditionOperator::Contains => actual
            .and_then(serde_json::Value::as_str)
            .zip(expected.and_then(serde_json::Value::as_str))
            .is_some_and(|(actual, expected)| actual.contains(expected)),
        ConditionOperator::GreaterThan => actual
            .and_then(serde_json::Value::as_f64)
            .zip(expected.and_then(serde_json::Value::as_f64))
            .is_some_and(|(actual, expected)| actual > expected),
        ConditionOperator::LessThan => actual
            .and_then(serde_json::Value::as_f64)
            .zip(expected.and_then(serde_json::Value::as_f64))
            .is_some_and(|(actual, expected)| actual < expected),
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use kitsune_core::{
        events::DomainEvent,
        identity::{OrganizationId, UserId},
    };

    use super::*;

    struct RecordingExecutor;

    #[async_trait]
    impl ActionExecutor for RecordingExecutor {
        async fn execute(
            &self,
            action: &str,
            _config: &serde_json::Value,
            _event: &EventEnvelope,
            _idempotency_key: Uuid,
        ) -> DomainResult<serde_json::Value> {
            Ok(serde_json::json!({"executed": action}))
        }
    }

    fn graph(organization_id: OrganizationId) -> AutomationGraph {
        AutomationGraph {
            id: FlowId::new(),
            organization_id,
            name: "First blood alert".into(),
            version: 1,
            nodes: BTreeMap::from([
                (
                    "trigger".into(),
                    AutomationNode {
                        id: "trigger".into(),
                        label: "First blood".into(),
                        kind: AutomationNodeKind::Trigger {
                            event_kinds: vec!["identity.user.created".into()],
                        },
                    },
                ),
                (
                    "condition".into(),
                    AutomationNode {
                        id: "condition".into(),
                        label: "Schema v1".into(),
                        kind: AutomationNodeKind::Condition {
                            pointer: "/schema_version".into(),
                            operator: ConditionOperator::Equals,
                            value: Some(serde_json::json!(1)),
                        },
                    },
                ),
                (
                    "action".into(),
                    AutomationNode {
                        id: "action".into(),
                        label: "Notify".into(),
                        kind: AutomationNodeKind::Action {
                            action: "notification.send".into(),
                            config: serde_json::json!({"channel": "in_app"}),
                        },
                    },
                ),
            ]),
            edges: vec![
                AutomationEdge {
                    from: "trigger".into(),
                    to: "condition".into(),
                    when: EdgeWhen::Success,
                },
                AutomationEdge {
                    from: "condition".into(),
                    to: "action".into(),
                    when: EdgeWhen::True,
                },
            ],
        }
    }

    #[tokio::test]
    async fn typed_dag_validates_and_executes_true_branch() {
        let organization = OrganizationId::new();
        let graph = graph(organization);
        assert_eq!(graph.validate().expect("valid graph").len(), 3);
        let event = EventEnvelope::new(
            organization,
            None,
            None,
            Uuid::now_v7(),
            Utc::now(),
            DomainEvent::UserCreated {
                user_id: UserId::new(),
            },
        );
        let run = AutomationEngine::new(RecordingExecutor, 32)
            .expect("engine")
            .run(&graph, &event, false)
            .await
            .expect("run");
        assert_eq!(run.status, RunStatus::Succeeded);
        assert_eq!(run.nodes.len(), 3);
        assert!(run.nodes[2].activated);
    }

    #[test]
    fn graph_rejects_cycles() {
        let mut graph = graph(OrganizationId::new());
        graph.edges.push(AutomationEdge {
            from: "action".into(),
            to: "condition".into(),
            when: EdgeWhen::Success,
        });
        assert!(graph.validate().is_err());
    }
}
