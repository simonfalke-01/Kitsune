# Current State

Updated: 2026-07-22 (Asia/Singapore)

## Cursor

- Current milestone: 02 — deterministic core and persistence.
- In progress: feature repositories and API/auth vertical slice.
- Next: secure local authentication/session service and Axum/OpenAPI shell.

## Verified

- `PROMPT.md` read and treated as the source specification.
- CTFd reference inspected only for externally visible features and schema
  concepts; no source or assets copied.
- Local toolchain: Rust 1.93.1, Node 24.13.0, Corepack 0.34.5, Docker 29.4.0.
- Core workspace format, 12 domain tests, and strict workspace Clippy pass.
- PostgreSQL 17 migration applies from empty state; SQLx compile-time query
  metadata is checked in; transactional audit/outbox/idempotency test passes.
- Lean cache/EventBus, typed automation DAG validation/execution, centralized
  public-network egress policy, and signed redirect-safe webhook delivery pass 7
  focused tests and strict Clippy.

## Risks being actively retired

- The acceptance surface is broad; each milestone is split into independently
  testable vertical slices so claims remain evidence-based.
- Final mascot artwork must be human-authored: art is deliberately blocked until
  milestone 16 and will carry provenance documentation.
