---
title: Rust osq report prints the Traceability, Validation and Coverage sections
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-specs, rust-config, rust-vcs]
---
## Goal

330 ported `osq report` through the end of its `History:` section. After
History, TypeScript prints `Traceability:`, `Validation:` and `Coverage:`.
This change ports the Validation and Coverage sections and their `--json`
members `validation` and `coverage`, with TypeScript's text and numbers.
It also settles Traceability for Rust: no capability opts in, so the section
is left out, as TypeScript leaves it out by default.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy and every Rust
test.

- The report crate's `report_summary` test compares Rust's text and JSON
  with goldens that TypeScript's built `dist` printed for eight projects,
  now through the Coverage section. The new `coverage-project` fills
  Validation, Coverage and the sidecar split; every other project leaves
  Validation out.
- The new `report_validation_coverage` test proves the sections line by
  line.
- The storage crate's new tests prove the three new readers row by row.

## Non-goals

- A Rust `Traceability:` section with gaps in it. TypeScript's scans
  TypeScript sources: `scenario()` calls in tests, `@scenario` tags on
  exported functions, and an import graph. In Rust, that needs a languages
  kernel adapter (ADR 017), or a section built from the ADR 024 link graph
  instead. That design waits for its own queue item.
- A `[traceability]` table in `osq.toml`.
- `Mutation:`, `Flaky tests:`, `Inbox wait:`, `Planning:` and every later
  section.
- `--since` and `--until`.

## Surface

- Changed: `osq report` (Rust) text gains the `Validation:` section, when an archived change has a validator run, and `Coverage:`
- Changed: `osq report --json` (Rust) gains the members `validation` and `coverage`

## Decisions

- ADR 022: the report feature reads validator runs, task event files and sidecars only through the storage kernel's three new readers.
- ADR 023: the readers are small pure folds behind one thin file read; the report feature builds and writes each section in its own small module.
- ADR 024: every new public item names its requirement and every test names its scenario.
- ADR 025: the readers read today's `change.jsonl`, task folders and `openspec/specs/` as they are, passing over the lines TypeScript passes over.
- ADR 026: no OpenSpec parsing changes; a living capability is a folder holding `spec.md`, as TypeScript decides it.
- ADR 027: the two tasks touch separate crates and run one after the other.
- ADR 028: `report` stays one command of the report feature.
- ADR 030: report appends no event and reacts to none; it only reads.
- ADR 029: Rust's config gains no traceability key; leaving Traceability out matches TypeScript's default `traceability.capabilities`, an empty list.

## Assumptions

- osq's own `osq.config.ts` opts the `traceability` capability in, so TypeScript's report for this repository prints a Traceability section that Rust's leaves out. Every other project, with no opt-in, matches.
- The Mutation, Flaky tests and Inbox wait sections print between History and Coverage only for data none of the fixtures hold. The golden script fails if any of them prints, and none did.
- Validation reads timestamps with `timestamp_ms`, which reads only `YYYY-MM-DDTHH:MM:SS.mmmZ`, where TypeScript uses `Date.parse`. Every timestamp osq writes has that form.
- The goldens and `golden/print-goldens.mjs.txt` were printed from `dist` built at `f1b07b8e`.

## Contract

### Requirement: Report validation and coverage
`report` SHALL print TypeScript's Validation and Coverage sections after
History, and write the matching `validation` and `coverage` members in
`--json`.

#### Scenario: Coverage project report
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/coverage-project`
- **THEN** its text and JSON equal the goldens TypeScript printed

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Latest validation", "Task event files" and "Capability sidecars". Task 1.
- `specs/rust-report/spec.md`: MODIFIED "Report summary", ADDED "Report validation" and "Report coverage". Task 2.
- `golden/` holds TypeScript's goldens for all eight summary cases, and `golden/print-goldens.mjs.txt` is the script that printed them. Copy the script to a `.mjs` file before running it. `fixture/coverage-project/` is the new fixture project. Task 2 copies both into the report crate.

No file is shared between the tasks.
