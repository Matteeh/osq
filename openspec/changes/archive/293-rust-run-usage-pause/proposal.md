---
title: The Rust run feature pauses on a usage limit as TypeScript does
depends_on: ["281"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-runners, rust-storage]
---
## Goal

When the executor hits its provider's usage limit, TypeScript writes
`.run/paused.md` and a `paused` event and does not count the attempt as a
failure. The Rust `osq run <id> <n>` cannot pause today: its pi stream
never reports a usage limit, its runner settings wait zero seconds, and a
`Paused` outcome only fails the run with no pause file. This change makes
the Rust pi stream turn pi's own account-limit errors and DeepSeek's insufficient balance into a `UsageLimit`
event, and makes the run feature wait TypeScript's default 1800 seconds,
write `.run/paused.md` as TypeScript does, and leave no dead marker and
no attempt change behind.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the corpus link gates included. It proves that
the pi stream gives a `UsageLimit` for each account-limit error and
nothing new for any other line, that a paused `osq run` writes
TypeScript's pause file and events and keeps the attempt, and that every
existing harnesses and run test, the TypeScript pi goldens included,
still passes.

## Non-goals

- Resuming on its own when the pause ends, refusing a run while a pause is active, and removing a passed pause; that belongs to the loop.
- Discarding the agent's edits after a pause. TypeScript does that only in a worktree, and the Rust run works in the checkout.
- A `gates.usageLimitWaitSeconds` key in `osq.toml`; the wait is TypeScript's default until rust-config reads that table.
- A usage limit in TypeScript's pi adapter.

## Surface

None

## Decisions

- ADR 022: the run feature writes `.run/paused.md` itself and reads nothing through another feature; its test reads the file back only through rust-storage `read_usage_pause`.
- ADR 023: the account-limit check on an error message is a pure leaf in the pi stream, and the pause file's text is built by a pure function the run's start calls.
- ADR 024: every public item ends its doc with `Implements: rust-harnesses/<requirement>` or `Implements: rust-run/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: `.run/paused.md` holds TypeScript's bytes, so TypeScript's readers and rust-storage read it as they are; the `usage_limit` and `paused` events keep core's shapes.
- ADR 026: no specs kernel changes.
- ADR 027: no scheduling changes.
- ADR 028: `RunFeature` keeps its one command and refusals.
- ADR 029: no new config keys; the 1800-second wait is a named constant beside the run's runner settings.

## Assumptions

- Pi reports an account limit as an assistant `message_end` with `stopReason` `error` and the error text in `errorMessage`. The texts that mean a usage limit are pi 0.87.0's own non-retryable limit list (`NON_RETRYABLE_PROVIDER_LIMIT_ERROR_PATTERN` in pi-ai's `utils/retry.js`) plus DeepSeek's `Insufficient Balance`, which pi's list misses and the executor's provider gives; no general `usage limit` match is added.
- A paused Rust run writes no `exited` event: the runner returns `Paused` without the harness's exit, while TypeScript writes `exited` just before `paused`. Readers that pair `started` with `exited` see a paused attempt as one without an exit, as they see a start that failed. The human accepted this gap: a paused run is easily restarted from there, and osq fails fast rather than changing the runner to carry the exit.
- The run's ending text stays `task <task> of <folder> paused on a usage limit`, so the `usage_limit_text` test stays as it is.

## Contract

### Requirement: Pi usage limit

See `specs/rust-harnesses/spec.md`, with "Pi usage limit", and
`specs/rust-run/spec.md`, with "Executor start" and "Run usage pause".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-harnesses/spec.md`: ADDED "Pi usage limit".
- `specs/rust-run/spec.md`: MODIFIED "Executor start"; ADDED "Run usage pause".

No file is shared between the two tasks.
