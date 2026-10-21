---
title: The runners kernel picks the harness and model for a role, retries a failed start, and pauses on a usage limit
depends_on: ["242"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core]
---
## Goal

Runners sit between the loop and the harnesses and own what every harness
shares. `crates/kernel/runners` is a placeholder today. With this change,
the run feature can start a task for a role without knowing which harness
runs it.

`run_task` takes a typed `RunnerSettings` value, never a config file, and
starts the role's harness, chosen by name from the `Harness` adapters it
is given, with the role's model and timeout and the agent environment
`role_env` builds as TypeScript's `buildRoleEnv` does (ADR 007). The
harness's events reach the caller as they arrive. A start that fails as
TypeScript's provider outage rule sees it, a start error or a crash while
the harness's own retry never got an answer, is started again up to
`start_retries` times after `retry_delay`, each retry giving a
`HarnessRetry` event. A `UsageLimit` the harness reports gives a `Paused`
event and a pause until the time `pause_until` decides, as
`src/core/run/usage-pause.ts` decides it.

Tests use fake harnesses and a fake clock, with no real model and no real
waiting.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the role environment and pause time tables, and the
`run_task` tests with fake harnesses: harness and model per role, the
start request and events, retries and their events, and usage limit
pauses.

## Non-goals

- Reading `osq.config.ts` or `osq.toml`; the caller builds `RunnerSettings`.
- Any real harness adapter: wiring pi's `run_process` and `pi_line_events` to `Harness`, finding its binary and its version probe come with running pi end to end.
- The loop, the run feature, writing events or `.run/paused.md` to files, the pause log line, and waiting out a pause.
- Pausing only the harness or model that hit the limit, which ADR 027's table leaves to the Runners and harnesses milestone; the pause here is the value TypeScript computes, and who waits on it is the caller's choice.
- Checking at startup that a role's model exists, per-role concurrency limits, and logging.
- Changing TypeScript or any other crate.

## Surface

None

## Decisions

- ADR 022: `osq-kernel-runners` stays a kernel crate on `osq-core` alone; it adds no dependency, so its `Cargo.toml` and `Cargo.lock` do not change, it does not depend on `osq-kernel-harnesses`, and no feature calls it yet.
- ADR 023: `role_env`, `find_usage_limit`, `pause_until`, the failed-start rule and the time text are pure leaves; `run_task` is the thin orchestrator, and its only IO goes through the `Harness` and `Clock` ports.
- ADR 024: every public function's doc ends with `Implements: rust-runners/<requirement>`, and every test names `Covers: rust-runners/<scenario>`.
- ADR 025: the runner gives the event types and fields today's `.run/events/<n>.jsonl` holds: `harness_retry` and `paused` with TypeScript's data, and times in the `YYYY-MM-DDTHH:MM:SS.mmmZ` form TypeScript writes.
- ADR 026: no OpenSpec parsing is involved.
- ADR 027: the kernel decides nothing about scheduling; this change's scope is `crates/kernel/runners` alone, which no other planned change touches.
- ADR 028: no feature crate is written, so no `Feature` is exposed.

## Assumptions

- "A start that fails as TypeScript retries it" means what TypeScript retries as a `provider_unavailable` death with `gates.providerRetries` and `gates.providerRetryDelaySeconds`, plus a harness that cannot be started at all. TypeScript retries those as a new task attempt with a `retry` event; here the runner retries inside one attempt and gives `HarnessRetry` events, as the brief asks. A plain crash or timeout without an open harness retry is not retried here; the caller judges it as today.
- The runner's `HarnessRetry` `end` event with `success: true` after a retried start that worked closes its own open `start`, so TypeScript's provider outage rule, which treats an open `start` as an outage, does not misread a later crash of that start. When retries run out, the `start` stays open on purpose.
- Times are read only in the fixed form `YYYY-MM-DDTHH:MM:SS.mmmZ`, as `timestamp_ms` in the storage kernel reads them, where TypeScript's `Date.parse` takes more forms and rolls an impossible day such as 30 February over. Every adapter writes `resetsAt` with `toISOString`, which always gives the fixed form, so the two agree on what harnesses write; any other text pauses for `usage_limit_wait`.
- `role_env` matches names with case, as TypeScript does on Unix; the Rust build is Unix only.
- `RunnerSettings` has no `Default`, so no number is written in the crate; the caller gives `start_retries`, `retry_delay` and `usage_limit_wait`, whose TypeScript defaults are 3, 300 seconds and 1800 seconds.

## Contract

### Requirement: Role environment

See `specs/rust-runners/spec.md`.

### Requirement: Usage limit pause time

See `specs/rust-runners/spec.md`.

### Requirement: Harness and model per role

See `specs/rust-runners/spec.md`.

### Requirement: Start retries

See `specs/rust-runners/spec.md`.

### Requirement: Usage limit pause

See `specs/rust-runners/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-runners/spec.md`: ADDED "Role environment", "Usage limit pause time", "Harness and model per role", "Start retries" and "Usage limit pause".

Tasks 1 and 2 share `crates/kernel/runners/src/lib.rs`; task 2 runs after task 1.
