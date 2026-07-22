# Architecture

## Runtime

Kitsune is a Cargo and pnpm monorepo. `kitsune-server` composes stateless Axum
API nodes. PostgreSQL is the authoritative store. Lean mode uses bounded local
adapters for cache, events, files, sessions, and notifications; full mode can
select Redis, NATS JetStream, S3, SMTP, and an orchestrator independently.

Domain code in `kitsune-core` owns invariants and deterministic engines. It has
no dependency on HTTP, SQL, or a container runtime. Every accepted state change
produces a typed domain event. Consumers attach through `EventBus`; transport
fanout, audit, automation, notifications, integrations, and plugins do not
couple to command handlers.

## Crate boundaries

- `kitsune-core`: aggregate types, authorization primitives, game modes,
  scoring, events, flags, integrity, and adapter traits.
- `kitsune-db`: SQLx PostgreSQL implementation and embedded migrations.
- `kitsune-automation`: local/NATS event buses, typed DAG executor, signed and
  retried webhooks, and SSRF policy.
- `kitsune-orchestrator`: Kubernetes, Docker/Podman, and Nomad adapters behind
  the resource- and network-aware `Orchestrator` contract.
- `kitsune-plugins`: Wasmtime Component Model host, capability grants, resource
  budgets, manifests, registry, and theme packs.
- `kitsune-integrations`: CTFd/ctfcli interchange, Discord, S3, SMTP, and
  telemetry adapters.
- `kitsune-api`: Axum REST, WebSocket/SSE, middleware, auth, and generated
  OpenAPI 3.1.
- `kitsune-cli`: the `kit` operator command.
- `kitsune-server`: configuration and dependency composition only.

## Data and consistency

Commands execute in database transactions, persist state plus an outbox event,
then publish. Consumers are idempotent by event ID. Scores are derived by pure
strategies and persisted as append-only score entries for historical graphs.
Challenge submissions lock only their target challenge while deciding solves
and first blood, and use a PostgreSQL sequence for globally monotonic score IDs
without an event-wide counter hotspot. Client idempotency keys replay immutable
digest-only receipts. Freeze marks new ledger entries as temporarily concealed;
unfreeze reveals history without rewriting it. A&D tick ownership uses
PostgreSQL advisory locks; orchestration operations use idempotency keys.
WebSocket nodes subscribe to the shared bus and batch score updates without
requiring affinity.

## Security boundaries

HTTP authorization is deny-by-default and evaluated using org/event-scoped RBAC.
Passwords use Argon2id; browser mutations require CSRF proof; API tokens are
scoped and revocable. All egress passes a DNS/IP-rebinding-resistant SSRF guard.
WASM plugins have explicit capabilities, allow-listed egress, namespaced state,
fuel, epoch, memory, and concurrency limits. Instance networks deny cross-team
traffic by default. Sensitive config uses redacted secret wrappers.

## Web

SvelteKit 5 renders public and authenticated surfaces with progressive
enhancement. One generated TypeScript client consumes the OpenAPI document.
CSS-variable Kitsune tokens support light/dark and theme packs. All visible copy
comes from tone-aware i18n catalogs. Brand, mascot, and extension-slot
components centralize operator toggles and entitlement behavior.
