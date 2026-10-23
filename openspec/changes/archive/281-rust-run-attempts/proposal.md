---
title: The Rust run feature counts attempts and hands the prior failure to a retried task
depends_on: ["280"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-retry]
---
## Goal

A retried task should know which attempt it is and why the last one failed,
as TypeScript's executor prompt tells it. The Rust run always passes
`PriorAttempt::default()` and writes attempt 1 on `started`, so a task run
after `osq retry` or a requeued recertification gets no prior context. This
change gives the storage kernel `read_retry_context`, a port of TypeScript's
`readRetryContext`, which reads a task's attempt, prior failure reason and
failure output from its `retry` and `recertification` events and the dead
marker a retry kept. `osq run <id> <n>` then passes that context to
`executor_prompt` and writes its attempt on `started`.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the corpus link gates included. It proves the storage
reader matches TypeScript on each event shape, that a first run, a run
after a retry and a run after a requeued recertification hand pi the prior
context TypeScript's prompt holds, and that every existing storage and run
test, the prompt goldens included, still passes.

## Non-goals

- Automatic retries and the usage-limit pause.
- The pre-spawn verify and the instructions drift check, which TypeScript runs only on attempt 1.
- The `attempt` on `dead` events, which TypeScript's dead event does not carry either.

## Surface

None

## Decisions

- ADR 022: the run reads the retry context only through the storage kernel's `read_retry_context`, never by parsing the retry feature's events itself.
- ADR 023: `read_retry_context` never fails, and its ANSI stripping and event folding are pure leaves; the run's `after_lock` stays the orchestrator.
- ADR 024: every public item ends its doc with `Implements: rust-storage/<requirement>` or `Implements: rust-run/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: the reader takes the event and marker files exactly as TypeScript and the Rust retry feature write them; the `started` event keeps its shape.
- ADR 026: the marker body is split from its frontmatter only through storage's `markdown_body`, which uses rust-specs `parse_frontmatter`.
- ADR 027: no scheduling changes.
- ADR 028: `RunFeature` keeps its one command and refusals.
- ADR 029: no new config keys.

## Assumptions

- The change depends on 280 only because both add exports to `crates/kernel/storage/src/lib.rs` and `src/read/mod.rs`. Stacking on 280 keeps the two from conflicting at land.
- The retry context reads lines loosely, as TypeScript does: a blank line, a line that is not JSON, or a field of the wrong type is passed over, and the strict core event parser is not used.
- An attempt reads only as a whole number that fits `u64`; TypeScript would also take a negative whole number, which osq never writes.
- The storage table's expected values were printed by TypeScript's `dist` `readRetryContext` over folders built as each row says.

## Contract

### Requirement: Retry context

See `specs/rust-storage/spec.md`, with "Retry context", and
`specs/rust-run/spec.md`, with "Executor start" and "Run attempts".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Retry context".
- `specs/rust-run/spec.md`: MODIFIED "Executor start"; ADDED "Run attempts".
