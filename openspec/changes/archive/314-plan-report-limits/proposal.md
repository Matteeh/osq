---
title: The plan report takes its sizes from config in both languages
depends_on: ["312", "313"]
verify: sh scripts/verify-rust.sh
features:
  reads: [cli-foundation, spec-lint-and-approve, status-inspection, watcher-and-harness]
---
## Goal

Every limit comes from config, but the report that opens each plan prompt
still hard-codes sizes. TypeScript reads the history and disclosure sizes
from the `planning` block, but keeps the repository record's three sizes
(5, 20 and 10) as constants in `src/core/report/report.ts`. Rust reads none
of them: its config kernel has no `planning` block, so the plan feature
hard-codes all eight in `record.rs`, `hints.rs` and `disclosures.rs`.

After this change TypeScript has a `planning.record` block, the Rust config
kernel reads `[planning]` with TypeScript's keys, defaults and refusals, and
both plan reports take every size from config. With the defaults every plan
prompt and golden stays byte for byte the same.

## Verify

`sh scripts/verify-rust.sh`

It runs the Rust format check, clippy, every Rust test including the plan
goldens and corpus tests, and cargo-mutants on the changed Rust lines. The
TypeScript task's own verify runs its new test, and the task asks for
`pnpm verify` before exit, as 253 did for its TypeScript half.

## Non-goals

- Changing any default.
- `planning.idleGapMinutes` and `planning.prices` in Rust; `osq.toml`
  refuses them as unknown keys until something in Rust reads them.
- Changing the history and disclosure sections in TypeScript, which already
  read config.

## Surface

- Added: `planning.record.minimumTasks` (config key, osq.config.ts)
- Added: `planning.record.recentChanges` (config key, osq.config.ts)
- Added: `planning.record.deadOutcomes` (config key, osq.config.ts)
- Added: `[planning.disclosures]` `recentChanges`, `maxCharacters` (osq.toml keys)
- Added: `[planning.history]` `minimumTasks`, `recentTasks`, `maxCharacters` (osq.toml keys)
- Added: `[planning.record]` `minimumTasks`, `recentChanges`, `deadOutcomes` (osq.toml keys)

## Decisions

- ADR 008: no new query table or index column; the record sizes only bound what the existing archive readers return.
- ADR 025: the Rust plan reads the archive through the storage kernel as before; `osq.toml` gains keys but no format change.
- ADR 026: nothing here parses specs; the plan report still reads ownership through the specs kernel.
- ADR 027: depending on 312 keeps `crates/kernel/config/src/config.rs` out of two approved changes at once.
- ADR 028: the plan feature's `Feature` entry is unchanged; only `next/report.rs` and its section builders change.
- ADR 029: the planning block is one module, `blocks/planning.rs`, with TypeScript's camelCase keys, defaults as named constants and strict unknown keys.
- ADR 022: the plan feature reads the sizes through `load_config`, as `next/number.rs` already does; no other feature is called.
- ADR 023: `report::sections` reads the config with the archive; `build` and the section builders stay pure and take the sizes as arguments.
- ADR 024: each public Rust item ends with `Implements:`, each test names `Covers:`.

## Assumptions

- The record keys are named `minimumTasks`, `recentChanges` and `deadOutcomes`, to match `planning.history.minimumTasks` and `planning.disclosures.recentChanges`.
- Strict unknown keys mean an `osq.toml` that copies TypeScript's `planning.idleGapMinutes` or `planning.prices` is refused, as 312 does for TypeScript's other gates.
- The metrics-and-reporting capability has a duplicate scenario name (`Two report runs`), so `scenario()` refuses it; the TypeScript test uses `node:test`, as 313 did for cli-foundation.
- 312 rewrites `crates/kernel/config/src/config.rs` and the "Config file" requirement, and 313 edits `src/cli/plan.ts`. This change depends on both, and its "Config file" text builds on 312's.

## Contract

### Requirement: Repository record sizes

The system SHALL take the repository record's minimum measured tasks, window
and dead outcome count from `planning.record`, by default 5, 20 and 10.

#### Scenario: Configured record sizes
- **WHEN** configuration sets `planning.record.minimumTasks` to 6 and the archive holds 5 measured tasks
- **THEN** the record body is `This repository's measured record is too small (fewer than 6 tasks).`

## Human steps

None

## Delta

- `specs/metrics-and-reporting/spec.md`: ADDED "Repository record sizes".
- `specs/rust-config/spec.md`: ADDED "Planning settings"; MODIFIED "Config file" adds `planning` to 312's key list.
- `specs/rust-plan/spec.md`: MODIFIED "Repository record section", "History hints section" and "Disclosures section" take every size from config, each with a new configured-sizes scenario.

No file is shared between tasks.
