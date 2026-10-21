---
title: The plan feature's plan-prompt.md carries the record, history and disclosure sections TypeScript appends after the brief
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

249 made the Rust plan feature write `plan-prompt.md` only up to
`## Brief`. TypeScript's `buildOpeningPrompt` then appends what the
repository's history says, and planners use it to size tasks:

- `## This repository's record`
- `## What history says`, from the `task_outcomes` query table
- `## Recent executor disclosures`
- `## Manual edits`, when a kept edit is still open

This change writes those four sections in Rust, byte for byte as TypeScript
writes them under `DEFAULT_CONFIG`, from the storage read model.

Task 1 gives storage what the sections still lack. Each task outcome gains
its measured time and its scope resolver. A typed `task_outcomes` query
returns the rows of the `task_outcomes` table, so the plan feature reads
them without SQL, as ADR 022 asks. Task 2 adds the record and the history
hints to the prompt. Task 3 adds the disclosures and the manual edits, and
proves the sections against text TypeScript printed for a history fixture
and for this repository's archive up to 251.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the ignored ones, and the mutation check on the lines this change touches.
That includes:

- each section's rows on roots the tests build;
- the golden history fixture against TypeScript's text;
- the corpus test, which runs `plan --next` over this repository's archive
  numbered 001 to 251 and compares its sections with TypeScript's text from
  2026-10-21.

## Non-goals

- The steering section, which needs run triggers that the Rust loop does not read yet.
- Changing what TypeScript writes.
- Reading `osq.config.ts` or `osq.toml`. The limits are TypeScript's defaults: a 20-change record window, 30 tasks before the history shows, a 100-task history window, 1500 history characters, 3 disclosure changes and 4000 disclosure characters.

## Surface

None

## Decisions

- ADR 022: the plan feature reads the history only through storage's typed values: `read_history`, `read_manual_edits` and the new `task_outcomes` query. It opens no SQLite database and reads no other feature's files.
- ADR 023: each section body is a pure function over storage values. One function in `next/report.rs` does the reading, and `run_next` stays the only place that writes.
- ADR 024: every function that implements a requirement ends its doc with `Implements: rust-plan/<requirement>` or `Implements: rust-storage/<requirement>`, and every test names `Covers: <capability>/<scenario>`.
- ADR 025: the sections are read from today's archive files as they are: event streams, result files and `openspec/manual/` records.
- ADR 026: no OpenSpec work; delta capabilities come from the snapshot's parsed deltas.
- ADR 027: the plan feature decides nothing about scheduling.
- ADR 028: `PlanFeature` keeps its commands; only the `plan` command's prompt grows.

## Assumptions

- When `read_history` fails, `plan --next` fails with `Cannot read the archive: <error>` and writes no change folder. TypeScript reads around a broken stream instead, but Rust storage refuses any malformed event line ("Event file errors").
- Archived changes numbered up to 251 keep the files the sections read. A later sync may add a `recertification` event to an archived `change.jsonl`, but that event does not change any of the four sections.
- Lengths and cuts count UTF-16 code units, as JavaScript's `length` and `slice` do. Every text in today's archive is ASCII, where this equals bytes.
- The corpus test hard-links about 6,400 files into `target/tmp`, on the same filesystem as the repository, and falls back to copying when linking fails.
- The fixture's `tasks.md` files are left out, because the archiver ticks any `tasks.md` nested in a change folder, as found while planning 249. TypeScript's text for the fixture is the same without them; I checked.

## Contract

The deltas in `specs/rust-storage/spec.md` and `specs/rust-plan/spec.md` hold the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Measured task facts" and "Task outcome query".
- `specs/rust-plan/spec.md`: MODIFIED "Plan prompt" (sections 6 to 9 appended; the "Prompt sections" rows gain `<record>`; adds "Archive that cannot be read") and "TypeScript plan parity" (TypeScript's prompt is now `buildOpeningPrompt`'s, scenario kept). ADDED "Repository record section", "History hints section", "Disclosures section", "Manual edits section" and "TypeScript prompt sections parity".
- Shared file: `crates/features/plan/src/next/report.rs`, owned by task 2 and extended by task 3.
- Inputs in this folder: `fixture/plan-history/`, written by `golden/gen-fixture.mjs.txt`. `golden/plan-history-sections.md` and `golden/archive-sections.md` were printed by `golden/sections.mjs.txt` against `dist/` on 2026-10-21. `golden/005-beta-plan-prompt.md` is TypeScript's full prompt for the existing `plan-repo` fixture.
