---
title: Rust core reads the own_folder_path dead reason
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

TypeScript's own-folder gate (317) records the dead and retry reason
`own_folder_path`, and archived change 340 holds both. Rust core's
`DeadReason` and `FailureReason` lack it. The event corpus test parses every
archived event, so `sh scripts/verify-rust.sh` is red on main, and 342 task
1 died `blocked` on its change verify. This change adds the value, so main
is green again and 342 can be retried.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy and every Rust
test, the corpus tests included. Core's `event_values` test pins the two
lists, and `event_corpus` reads 340's lines again.

## Non-goals

- A gate that keeps TypeScript's reason lists and Rust's in step; a later
  queue item.
- Any other event or reason change.

## Surface

- Changed: Rust core's `DeadReason` and `FailureReason` accept `own_folder_path`

## Decisions

- ADR 025: Rust reads today's event files as they are, so it takes TypeScript's value and order unchanged.
- ADR 023: the new variant follows the existing ones; `ALL`, `as_str` and the `From` conversion list it.
- ADR 024: the changed scenario is proved by the test that already names it.
- ADR 022: the change stays in core, which does no IO and depends on no other crate.
- ADR 026: the value is TypeScript's exact string, so Rust keeps the shape of the files TypeScript writes.
- ADR 027: scheduling is untouched.
- ADR 028: no feature changes; features keep reading reasons through core.
- ADR 029: no config key is added.
- ADR 030: feature events and their cursors are untouched.

## Assumptions

- A scan of every archived event on 2026-10-25 found `own_folder_path` to be the only reason or outcome value Rust does not know.

## Contract

### Requirement: own_folder_path reason
Rust core reads and writes the dead and retry reason `own_folder_path`, as
TypeScript writes it.

#### Scenario: Archived own_folder_path lines read
- **WHEN** the event corpus test reads 340's `.run/events/1.jsonl`
- **THEN** its `dead` and `retry` lines with `own_folder_path` parse and write back unchanged

## Human steps

### Before approval

None

### After landing

- Run `osq retry 342 1`; the retry syncs main into 342's branch before it respawns.

## Delta

- `specs/rust-core/spec.md`: MODIFIED "Event types", adding `own_folder_path` to the `DeadReason` and `FailureReason` rows of "Reason and outcome values".
- No file is shared between tasks.
