---
title: The storage read model holds the nine tables built from event streams
depends_on: ["210"]
verify: sh scripts/verify-rust.sh
features:
  reads:
    - rust-core
---
## Goal

After 210, the Rust read model holds `changes`, `tasks` and `dead_attempts`.
This change adds the nine `osq query` tables TypeScript builds from event
streams and the plan and manifest records next to them, with rows equal to
TypeScript's:

- `pauses`, `recertifications`, `focused_runs`, `mutation_picks` and
  `mutation_survivors` from the task streams;
- `validator_runs` and `validator_findings` from `change.jsonl`;
- `notices` from `.run/plan.jsonl` and the manifest's `notices` record, over
  archived and rejected changes;
- `link_findings` from the last `plan.jsonl` record;
- the `label` columns from `openspec/trials/*.json`, as TypeScript's label
  pass fills them.

Storage already folds every event file. It now also keeps the events these
tables need, reads the plan records and the manifest's notices into the
snapshot, and reads rejected changes for `notices`. Five of the nine tables
have no row in the archive, so a fixture project under
`tests/fixtures/history/` gives every table rows. Its expected rows were
printed by TypeScript's `osq query --json` and are committed next to it.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with `-D warnings`
and every workspace test, the corpus tests included, then cargo-mutants on
the change's own diff when osq sets `OSQ_DIFF`. That covers the reading
tests and the table tests on the history fixture, whose expected rows
TypeScript printed, and the corpus test that compares the nine tables of
this repository's archive with TypeScript's golden rows. No test runs `node`
or `osq`, and none needs the network.

## Non-goals

- `disclosures`, `task_outcomes` and `manual_edits`, which `rust-storage-file-tables` adds, and `requirements`, which waits for the specs kernel.
- Any new event type or field in rust-core.
- The path rewriting `osq query` applies when it prints (project root to `.`, home to `~`). That is output formatting, and no archived row holds such a path today.
- Writing labels, which `osq label` does in TypeScript.
- A query command or a typed query API over the tables.

## Surface

- Added: the `osq-kernel-storage` public items `TableEvent`, `PlanRecord`, `Notice`, `LinkEntry`, `ManifestNotices`, `read_history`, `TrialLabels` and `read_trial_labels`; the `EventFacts` field `table_events`; the `ChangeSnapshot` fields `plan_records` and `manifest_notices`; and the `ReadModelError` variant `Labels`.
- Changed: `build_read_model` reads rejected changes and the trial label files, and the database holds twelve tables.

## Decisions

- ADR 022: storage stays a kernel crate on `osq-core` only. The nine tables are part of the read model that features read through, and storage reads only files.
- ADR 023: the row mapping and the plan, manifest and label parsing are pure leaves. Only `read_change`, `read_history`, `read_trial_labels`, `write_read_model` and `build_read_model` touch the disk.
- ADR 024: every public function's doc ends with `Implements: rust-storage/<requirement>`, and every test's doc names `Covers: rust-storage/<scenario>`. The golden comparison is a corpus test, and the history fixture tests are its fast counterpart, so the mutation check reruns only fast tests.
- ADR 025: storage reads `.run/plan.jsonl`, the manifest and `openspec/trials/*.json` as TypeScript writes them, and the database stays a cache that can be deleted.
- ADR 026: no Markdown or delta spec parsing is added.

## Assumptions

- The rows in `golden/` were printed by TypeScript's `osq query --json` on 2026-10-18 for archived changes 014 to 209: 44 `recertifications`, 251 `notices`, 50 `validator_runs`, 1 `link_findings`, and none in the other five tables. No rejected change exists today, so every `notices` row comes from an archived change.
- The rows in `fixture-rows/` were printed by the same command on the fixture project in `fixture/history/`. Every event line in it parses with rust-core's `parse_event_line`, which was checked on 2026-10-18.
- `plan.jsonl` is read as TypeScript reads it: a line that is not a valid record is left out rather than refused. It is a record log, not an event stream rust-core types, and a refusal would make `osq query` and the Rust read model disagree on archived changes.
- `serde_json` reads every `duration` in the archive and the fixture to the same `f64` as JavaScript does, since none has more than 15 significant digits. If a golden row differs in the last digit, task 3 reads the number from the line text, as `exact_cost` does.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Table events", "Plan records", "Manifest notices", "History reading", "Event table columns", "Trial labels"; MODIFIED "Read model tables", "TypeScript row parity".

Shared files: `crates/kernel/storage/src/lib.rs`, which task 1 extends with the new reading items and task 2 with the model items. `crates/kernel/storage/src/read/**` and `crates/kernel/storage/src/model/**`, which tasks 1 and 2 change and task 3 may correct where a golden row disagrees. The watcher recertifies tasks 1 and 2 when a later task touches them.
