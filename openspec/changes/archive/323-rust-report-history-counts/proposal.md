---
title: Rust osq report prints the History section's counts
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-specs, rust-config, rust-vcs]
---
## Goal

305 ported `osq report`'s header, `Specs Summary:` and `Now:`. This change
ports the next part, `History:` through `Scope regressions:`. Those lines
tell a human how attempts, verify runs, retries, deaths, costs and
rejections went. Rust prints them with TypeScript's text and numbers, and
in `--json` under `history`.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy and every Rust
test. The report crate's `report_summary` test compares Rust's text and JSON
with goldens that TypeScript's built `dist` printed for six projects,
including a new `history-project` that fills every History line. The storage
crate's new tests prove the stream reader row by row against TypeScript's
observers.

## Non-goals

- Rework, disclosures, dependencies and the size buckets. The queue item
  `rust-report-history-sizes` ports them.
- `Coverage:`, `Planning:` and every later section.
- `--since` and `--until`.
- The members of `history` this change does not port, such as `sizes`.

## Surface

- Changed: `osq report` (Rust) text gains the `History:` lines through `    Requeued for agent:`
- Changed: `osq report --json` (Rust) gains a `history` member with nine keys

## Decisions

- ADR 022: the report feature reads task streams only through the storage kernel's new `read_task_history` and `read_rejection_planner`.
- ADR 023: the readers are pure folds over parsed lines with one thin file read; the report feature sums and writes in small named functions.
- ADR 024: every new public item names its requirement and every test names its scenario.
- ADR 025: the readers read today's event JSONL as it is, passing over the lines TypeScript's report passes over.
- ADR 026: no OpenSpec parsing is added; the readers use the storage kernel's existing frontmatter reader.
- ADR 027: the two tasks touch separate crates and run one after the other.
- ADR 028: `report` stays one command of the report feature, with no new command.
- ADR 029: `report` reads no new config key.

## Assumptions

- TypeScript's report reads task streams loosely: it counts any JSON object line and checks only the fields it needs. Rust's strict `read_change` refuses such lines, so the new storage reader parses each line as plain JSON instead. The fixture holds loose lines on purpose.
- Rust sorts dead reasons and planner models by lowercase bytes. That equals TypeScript's `localeCompare` for every name osq writes today: lowercase letters, digits, `-`, `.` and `_` in reasons, where `_` never meets a digit at the same place.
- Costs are summed in the order TypeScript sums them, so a float total such as `0.7000000000000001` matches byte for byte.

## Contract

### Requirement: Report history
`report` SHALL print TypeScript's `History:` lines through
`    Requeued for agent:`, and write the matching `history` members in
`--json`.

#### Scenario: History of the history project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/history-project`
- **THEN** its text and JSON equal the goldens TypeScript printed

## Human steps

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Task history" and "Rejection planner". Task 1.
- `specs/rust-report/spec.md`: MODIFIED "Report summary", ADDED "Report history" and "Report cost text". Task 2.
- `golden/` holds TypeScript's goldens for all six summary cases, and `golden/print-goldens.mjs.txt` is the script that printed them. Copy the script to a `.mjs` file before running it. `fixture/history-project/` is the new fixture project. Task 2 copies both into the report crate.

No file is shared between the tasks.
