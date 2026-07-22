# Live Task Ledger

## Milestone 01

- [x] Read `PROMPT.md` and establish autonomous goal.
- [x] Inspect the CTFd feature/schema surface without copying implementation.
- [x] Create plan, architecture, milestones, state, todo, and decisions ledgers.
- [x] Draft KCL-1.0, CLA, NOTICE, and package license policy.
- [x] Complete and cross-check CTFd feature-parity matrix.
- [x] Scaffold all Cargo crates and pnpm workspaces.
- [ ] Add baseline CI and supply-chain policy.
- [ ] Run format, metadata, compile, lint, and base tests green.

## Subsequent work

The canonical ordered exit criteria are in `MILESTONES.md`. Expand the current
milestone here before implementation; never mark a later milestone from prose
or scaffolding alone.

## Milestone 02

- [x] Strongly typed organization/event/identity/team/division/bracket model.
- [x] Scoped RBAC permission evaluation.
- [x] Challenge types, visibility, answer validation, prerequisite graph, hints,
  writeup/survey schema, static/dynamic/plugin score rules.
- [x] Append-only score replay, freeze filtering, deterministic tie break.
- [x] Typed domain event and infrastructure port contracts.
- [x] Jeopardy, KotH, A&D, and workshop core engines with focused tests.
- [x] Initial PostgreSQL schema for all specified subsystems applies cleanly.
- [x] Compile-time checked SQLx transaction/outbox/audit/idempotency store.
- [ ] Feature repositories and mode-state optimistic concurrency.
- [x] Bounded in-process cache and filtered EventBus.
- [x] Automation DAG validation, branching, dry-run, execution trace, and action
  registry seam.
- [x] HMAC-signed retrying webhooks and shared DNS/IP/redirect SSRF defense.
- [ ] NATS/Redis scaled adapters.
- [ ] Milestone-wide format, strict Clippy, unit, and integration gate.
