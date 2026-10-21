---
queue_item: rust-runners-roles
queue_hash: sha256:77383d9f90f2334e8df4f94bf7a0b3196d4806ff5e0d3129e3145204473383a8
planner: null
date: 2026-10-21
---

### Goal

Runners sit between the loop and the harnesses and own what every harness shares (Architecture page). With them, the run feature can start a task for a role without knowing which harness runs it.

### Context

As of 2026-10-21:

- `crates/kernel/runners` is a placeholder; `rust-harness-process` gives the process runner and the pi adapter.
- TypeScript: harness and model per role in `osq.config.ts` (`executor`, `planner`, `validator`), harness retries (`HarnessRetryData` events), and the usage-limit pause (`src/core/run/usage-pause.ts`, `UsageLimit` and `Paused` events, `.run/paused.md`).
- ADR 025: osq.config.ts becomes a hand-written `osq.toml` at the switch.

### Requirements

- A role's harness and model come from a typed settings value, so the runner never reads `osq.config.ts`; reading `osq.toml` can come later.
- A start that fails as TypeScript retries it is retried as many times as the settings say, each retry giving a `HarnessRetry` event.
- A usage limit the harness reports gives a `UsageLimit` event and a pause until the time it names, as `usage-pause.ts` decides it.
- Tests use a fake harness, with no real model.

### Non-goals

- Reading configuration files, other harness adapters, the loop.
