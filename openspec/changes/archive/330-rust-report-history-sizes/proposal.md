---
title: Rust osq report prints rework, disclosures, dependencies and sizes
depends_on: ["323"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-specs, rust-config, rust-vcs]
---
## Goal

323 ported the `History:` section of `osq report` through
`Scope regressions:`. This change ports the rest of that section: the
`Rework:`, `Executor disclosures:` and `Dependencies added:` blocks, the
size-against-outcome tables by scope files and by acceptance lines, the
resolver 2 start and the size hint. Planners use these tables to size
tasks. Rust prints them with TypeScript's text and numbers, and in
`--json` under `history`.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy and every Rust
test. The report crate's `report_summary` test compares Rust's text and JSON
with goldens that TypeScript's built `dist` printed for seven projects,
through the whole History section, including a new `sizes-project` that
fills every new block. The storage crate's new tests prove the new readers
row by row; every row was checked against TypeScript's `dist` on
2026-10-24.

## Non-goals

- `Coverage:`, `Planning:`, the traceability, mutation, flaky-test,
  validation and inbox-wait sections, and every later section.
- `--since` and `--until`.
- The members of `history` this change does not port. After it, `history`
  holds every member TypeScript writes there.
- Rust's plan prompt record. It keeps its own measured-task code in the plan
  crate; features never share code (ADR 022).

## Surface

- Changed: `osq report` (Rust) text gains `Rework:`, `Executor disclosures:`, `Dependencies added:`, `  Size by scope files (legacy):`, `  Size by scope files (resolver-2):`, `  Resolver 2 starts at:`, `  Size by acceptance lines:` and `  Size hint:`
- Changed: `osq report --json` (Rust) `history` gains `rework`, `disclosures`, `dependencies` and `sizes`

## Decisions

- ADR 022: the report feature reads task sizes, added dependencies, fixes and disclosures only through the storage kernel's new readers.
- ADR 023: the readers are pure folds over parsed lines with one thin file read; the report feature buckets and writes in small named functions.
- ADR 024: every new public item names its requirement and every test names its scenario.
- ADR 025: the readers read today's event JSONL, task files and proposals as they are, passing over the lines TypeScript's report passes over.
- ADR 026: `fixes` and task files are parsed by the specs kernel's `parse_proposal` and `parse_task_file`.
- ADR 027: the two tasks touch separate crates and run one after the other.
- ADR 028: `report` stays one command of the report feature, with no new command.
- ADR 029: the size hint reads `limits.maxScopeFiles` and `limits.maxAcceptanceLines` through `load_config`, which `report` already calls.

## Assumptions

- TypeScript reads event timestamps with `Date.parse`, and Rust with `timestamp_ms`, which reads only `YYYY-MM-DDTHH:MM:SS.mmmZ`. Every timestamp osq writes has that form, so durations match.
- Rust orders change ids, folder names and task ids by leading number, then by bytes, where TypeScript falls back to `localeCompare`. Both give the same order for every name osq writes: digits, lowercase letters and `-`.
- A task file that does not parse gives an empty title and 0 acceptance lines in Rust. TypeScript's `parseTaskMd` gave the same for the text `not a task`, checked on 2026-10-24.
- The goldens and `golden/print-goldens.mjs.txt` were printed from `dist` built at `b20b7064`. The script now cuts text at the first blank line after `History:` and copies only the `history` keys the report writes.

## Contract

### Requirement: Report history sizes
`report` SHALL print TypeScript's whole `History:` section, the rework,
disclosure and dependency blocks and the size tables included, and write
the matching `history` members in `--json`.

#### Scenario: Sizes of the sizes project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/sizes-project`
- **THEN** its text and JSON equal the goldens TypeScript printed

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Task sizes", "Dependencies added", "Change fixes" and "Result disclosure reader". Task 1.
- `specs/rust-report/spec.md`: MODIFIED "Report summary", ADDED "Report history blocks" and "Report sizes". Task 2.
- `golden/` holds TypeScript's goldens for all seven summary cases, and `golden/print-goldens.mjs.txt` is the script that printed them. Copy the script to a `.mjs` file before running it. `fixture/sizes-project/` is the new fixture project. Task 2 copies both into the report crate.

No file is shared between the tasks.
