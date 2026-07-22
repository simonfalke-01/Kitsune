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
