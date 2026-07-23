# Kitsune Build Plan

This ledger derives from `PROMPT.md` and is the authority for the autonomous
build. A feature is complete only when implementation, verification, docs, and
operational wiring are all present.

1. Establish the workspace, clean-room parity inventory, license, CI, and
   resumable ledger.
2. Build the deterministic domain core: identity, events, challenges, scoring,
   game modes, integrity rules, configuration, and adapter contracts.
3. Build PostgreSQL persistence and migrations, then the secured HTTP, OpenAPI,
   WebSocket, and SSE surfaces.
4. Complete local/OIDC/passkey/SAML/TOTP authentication, RBAC, sessions, tokens,
   audit, Jeopardy, and the player/admin web experience.
   The owner-directed frontend reset replaces the original Svelte path with
   React 19 and React Aria Components before further product surfaces land.
5. Complete optional integrations, object storage, notifications, imports,
   Grafana-ready observability, demand-aware orchestration, KotH, and
   Attack/Defense.
6. Complete automation, signed webhooks, plugin Component Model host, WIT SDK,
   marketplace seam, themes, and example extensions.
7. Complete lean/full bootstrap, CLI, four deployment targets, complete web UX,
   docs, tests, a11y, security, and performance tuning.
8. Only after all functional work is green, replace neutral brand slots with
   original hand-authored Kon artwork and final lore flourishes.
9. Audit every §14 gate and finish only after the full suite and smoke pass are
   green.

Every cycle follows: read state → select one checkable slice → implement → run
focused verification → fix red results → update this ledger → continue.

The frontend reset is not a cosmetic reskin. It replaces the runtime, route
composition, server-state model, interaction primitives, visual tokens, page
hierarchy, component documentation, and accessibility contracts together.
Legacy Svelte routes are removed once their React counterparts pass the same
real API and browser journeys.

The organizer experience is a product surface, not a maintenance afterthought.
Its live-ops workspace must remain calm and responsive while exposing event,
submission, competitor, automation, instance-capacity, and platform health in
one coherent information hierarchy. Operational telemetry must also remain
open: Prometheus scrape endpoints and OpenTelemetry exporters are documented as
direct Grafana data sources, with provisioned examples and maintained
dashboards.
