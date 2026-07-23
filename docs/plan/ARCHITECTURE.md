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
The score-history projection computes cumulative totals from that immutable
ledger and applies the same organization, division, hidden, freeze, and
reversal rules as the ranked snapshot. WebSocket nodes subscribe to the shared
bus without requiring affinity; browser stores coalesce score bursts into one
bounded refresh while server-side cross-node batching remains a scale milestone.

Hint bodies live only in the private hint table and are projected as `null`
until a competitor-scoped unlock exists. The unique unlock key makes repeated
requests free, while the first unlock and its optional negative score entry
share the challenge transaction and outbox boundary.

Team membership is serialized on the team row whenever event admission and
membership can race. Invite values are shown once and only SHA-256 digests are
stored; rotation invalidates the prior digest atomically. Captains must transfer
authority before leaving, while they may remove only non-captains. Event
registration resolves the event's individual/team/hybrid competitor policy,
validates division and bracket ownership, and upserts a single null-safe
competitor row. Registration and later invite joins both enforce every active
registered event's team-size limit under the same team lock, preventing a team
from becoming ineligible through a concurrent join.

Post-solve engagement is isolated in a transactional repository. Writeups and
survey responses are uniquely keyed by challenge plus null-safe user/team
competitor and require an accepted solve. Author and reviewer transitions are
separate domain policies. Survey analytics aggregate validated integer answers
without returning raw competitor responses.

Manual-verification answers are authenticated-encrypted by the API before the
submission transaction and retained only for pending outcomes. The RBAC-guarded
review projection decrypts in memory. Acceptance locks the challenge and pending
submission in the same order as automatic solves, then reuses the deterministic
solve, first-blood, score-ledger, audit, and outbox path.

Dynamic challenge instances bind to exactly one event competitor with a
null-safe active-lease uniqueness constraint. Issued high-entropy flags are
represented in PostgreSQL only by fixed-length SHA-256 digests and a monotonic
generation. Submission resolves the authoritative user/team competitor and
constant-time verifies against its unexpired ready or unhealthy lease inside
the same challenge transaction used for solve and score writes. Provisioning
and rotation remain orchestrator operations, so no database lock is held while
calling Kubernetes, Docker/Podman, or Nomad.
The provider-ready commit validates the authored template and tenant owner,
enforces a bounded TTL and one active lease, rejects secret-bearing connection
metadata, and is idempotent on the provisioning operation key. Rotation uses a
monotonic generation compare-and-swap and commits its digest, audit record, and
typed event together after successful provider injection.

Plugin challenge answers cross a deliberately narrow Component Model boundary.
An Ed25519-signed manifest binds the package version, artifact digest, declared
challenge kinds, and granted capabilities before Wasmtime compiles the
component. The v1 verifier world imports nothing, so it has no ambient files,
network, environment, clock, or database authority. Each call receives bounded
answer and JSON byte arrays and is constrained by memory, fuel, relative epoch
deadline, and per-plugin concurrency. A read-only PostgreSQL preflight applies
the same event, competitor, visibility, solved-state, and attempt policy as the
submission transaction before untrusted code can run. Its decision is bound to
the exact answer digest, plugin selector, resolved competitor, and challenge
revision, then checked again under the normal challenge lock. Idempotent receipt
replays are answer-bound and bypass component execution entirely.

## Security boundaries

HTTP authorization is deny-by-default and evaluated using org/event-scoped RBAC.
Passwords use Argon2id; browser mutations require CSRF proof; API tokens are
scoped and revocable. OIDC uses Authorization Code with PKCE S256, one-time
state, nonce, and a separately encrypted browser binding. Callback URLs come
only from the server's canonical public origin. Provider secrets and transient
verifiers are authenticated-encrypted; only state and binding digests persist.
WebAuthn uses that same canonical public origin as its exact relying-party
origin and host-derived RP ID. Registration requires user verification; its
serialized verifier state is bounded and authenticated-encrypted in PostgreSQL,
while the browser keeps only an HttpOnly, Strict, path-scoped flow ID plus
random binding. The repository validates the digest in constant time, consumes
successful ceremonies transactionally, advances stored credential state and
signature counters, and records audit/outbox events. A credential cannot be
removed if it is the account's last usable login method.
SAML is SP-initiated and provider-scoped. Kitsune signs AuthnRequests with a
persistent first-boot RSA identity, requires signed assertions, and validates
issuer, audience, destination, recipient, time windows, RelayState, and
`InResponseTo`. A private HttpOnly flow cookie is digested separately from the
public RelayState; PostgreSQL consumes both the flow and response/assertion IDs
transactionally so replay protection remains cross-node. Metadata is bounded,
rejects DTD/entity declarations, and is either explicitly operator-trusted or
verified by a pinned metadata-signing certificate. URL ingestion uses the same
DNS-pinned egress policy as other outbound calls. Encrypted assertions stay
disabled because the selected RustCrypto RSA backend's decryption path carries
RUSTSEC-2023-0071; key generation, signing, and signature verification are not
affected.
Private identity providers require an exact trusted origin in server
configuration. All egress resolves and validates every address, then pins those
validated addresses into the request client for every redirect hop so DNS
rebinding cannot change the connection target after policy evaluation. WASM
plugins have explicit capabilities, allow-listed egress, namespaced state, fuel,
epoch, memory, and concurrency limits. Instance networks deny cross-team traffic
by default. Sensitive config uses redacted secret wrappers.

## Web

SvelteKit 5 renders public and authenticated surfaces with progressive
enhancement. One generated TypeScript client consumes the OpenAPI document.
CSS-variable Kitsune tokens support light/dark and theme packs. All visible copy
comes from tone-aware i18n catalogs. Brand, mascot, and extension-slot
components centralize operator toggles and entitlement behavior.
