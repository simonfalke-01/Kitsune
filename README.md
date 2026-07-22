# Kitsune

Kitsune is a fast, event-driven Capture The Flag platform for Jeopardy, King of
the Hill, Attack/Defense, workshops, and custom game modes. The paved road is a
zero-configuration lean profile backed by PostgreSQL; every scaled integration
is optional and sits behind an adapter contract.

> Kitsune is under active construction. The checked acceptance ledger in
> `docs/plan/` is the source of truth; a scaffold or passing subset is never
> represented as a finished release.

## Product principles

- `docker compose up` starts the complete lean experience without external
  auth, email, Redis, NATS, S3, or an orchestrator.
- Rust/Axum/SQLx own the stateless backend; SvelteKit owns the accessible web
  application; `kit` owns operator workflows.
- Typed events connect realtime updates, audit, notifications, integrations,
  automations, and capability-secured WebAssembly plugins.
- Jeopardy, KotH, A&D, and workshop behavior share one deterministic `GameMode`
  contract.

## Repository map

- `crates/` — domain core, API, persistence, automation, integrations,
  orchestration, plugins, CLI, and server composition
- `web/` — SvelteKit player and organizer application
- `wit/` and `plugins/` — Component Model contracts and first-party examples
- `deploy/` — Compose, OCI/Podman, Helm, Terraform, and raw Kubernetes paths
- `docs/` — Starlight product docs plus build and decision ledgers
- `tests/` — contract, browser, accessibility, and load suites

## Development

Install current stable Rust, Node 24+, pnpm 10, Docker, and `just`, then use
`just dev`, `just test`, `just lint`, or `just build`. The eventual operator
golden path remains `docker compose up`; developer dependencies do not become
runtime prerequisites.

## Clean-room notice

The local `CTFd-reference-repo/` is used only to inventory product behavior and
learn import schema concepts. Kitsune is an original Rust/Svelte implementation.
No CTFd code, source structure, templates, or assets may be copied into Kitsune.

## Licensing FAQ

**What is the license?** Kitsune is licensed under the bespoke Kitsune Community
License 1.0 (`KCL-1.0`) in `LICENSE`.

**May I inspect and self-host it?** Yes. You may view the source and run an
unmodified copy for your own non-commercial/internal events, including free
non-commercial events for others, subject to KCL-1.0.

**May I modify, fork, distribute, rebrand, sell, or offer a hosted service?** No.
Those rights are not granted by KCL-1.0. Contact the copyright holder for a
separate commercial or development license.

**Is this open source?** No. This is a source-available proprietary license, not
an OSI-approved open-source license; have it reviewed by a lawyer before relying
on it.

**Who owns contributions?** Contributors must accept `CLA.md`, which assigns
contribution copyright to `[COPYRIGHT HOLDER]` so the owner remains able to
license and commercialize Kitsune consistently.

