# Decisions

Format: `YYYY-MM-DD — decision — rationale`.

- 2026-07-22 — Treat the current repository root as the `kitsune/` root shown in
  the prompt — the directory name in the layout is descriptive, while nesting
  another repository would separate `PROMPT.md` and the clean-room reference
  from the audit trail.
- 2026-07-22 — Use Rust edition 2024 — it is stable, satisfies “2021+,” and is
  the coherent paved road for a new Rust 1.93 codebase.
- 2026-07-22 — Persist commands and domain events transactionally using an
  outbox — it prevents integrations from observing changes that did not commit.
- 2026-07-22 — Model divisions as event-scoped membership classifications and
  brackets as tournament containers — this keeps both first-class without
  conflating scoreboard filtering and elimination structure.
- 2026-07-22 — Use UUIDv7 for persisted IDs — sortable identifiers improve
  index locality while remaining safe to generate across stateless nodes.
- 2026-07-22 — Keep de-branding socially encouraged rather than entitlement
  enforced — this intentionally implements the prompt’s free-but-asked model;
  `white_label` only unlocks the supported one-click customization flow.
- 2026-07-22 — Do not initialize the Sites plugin’s Vinext starter — the user’s
  explicit SvelteKit 5 stack overrides that generic starter while its capability
  and validation guidance still applies.
- 2026-07-22 — Draft KCL-1.0 as bespoke terms rather than copying PolyForm text —
  the requested permissions/prohibitions differ and the repo must clearly warn
  that counsel should review the license.
- 2026-07-22 — Exclude the local CTFd reference checkout from Kitsune history —
  it is third-party audit input, not a distributable part of the proprietary
  product, and this keeps the clean-room boundary visible.
- 2026-07-22 — Check SQLx offline metadata into `.sqlx/` — compile-time query
  checking remains enforceable in CI without making a live database a Rust
  compilation prerequisite.
- 2026-07-22 — Store rotating A&D flag digests and issue HMAC-authenticated
  opaque values — plaintext flags never enter logs or general event payloads.
- 2026-07-22 — Treat an empty egress host allow-list as “any public host,” not
  “any address” — integrations remain zero-config while loopback, private,
  carrier-grade NAT, metadata, link-local, documentation, and multicast ranges
  stay blocked after every DNS resolution and redirect.
- 2026-07-22 — Keep the lean EventBus intentionally non-durable and pair it with
  the PostgreSQL outbox — zero-config fanout stays fast while durable consumers
  can resume independently of process-local broadcast buffers.
- 2026-07-22 — Use encrypted private cookies containing random opaque session
  tokens whose SHA-256 digests are stored server-side — cookie confidentiality,
  immediate revocation, and database session management all hold without putting
  account claims in browser-controlled state.
- 2026-07-22 — Represent pre-tenant security events with an absent organization
  scope — inventing a tenant ID for a login against an unknown slug would corrupt
  audit semantics and violate the outbox foreign key.
- 2026-07-22 — Default Secure cookies off only in the direct lean HTTP topology
  and make the layered setting authoritative — TLS deployments and shipped scale
  manifests enable it, while localhost remains usable without hidden setup.
