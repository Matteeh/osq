---
title: A digest of archived changes, by date or by selection
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - status-inspection
    - web-inspection
    - watcher-and-harness
---
## Goal

A human who wants to know what happened since a date, or what a few changes
did, reads git history and archive folders for an hour. After this change,
`osq digest --since <date>` or `osq digest <id>...` prints the answer in a
minute of reading. Every line comes from a file in an archive: the proposal's
title and `## Goal`, the deltas, the ADRs the proposal names, and the task
event streams. No model is involved, and the same archives and arguments
always print the same bytes.

The archive reader is its own module, so docs-onboarding can reuse it later
for a capability's recent changes. The dashboard can read the versioned JSON
later too.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests read temporary
archives and osq's own archive. They prove the following:

- A date range selects exactly the archives dated inside it, both ends
  included. An id selection comes back in date order, and an unknown id fails
  with its name.
- Every field appears for a fixture archive, including a dead attempt's reason.
- Requirements are listed under ADDED, MODIFIED, REMOVED, and RENAMED
  correctly.
- `--no-cost` output carries no cost and no model.
- No output contains an absolute path, a tool summary, or verify output.
- Two runs give byte-identical Markdown and JSON.
- An empty range says so and exits zero.

## Non-goals

- Prose written by a model. That is docs-narration.
- Present-state docs for onboarding. That is docs-onboarding.
- Changes that have not archived, and rejected changes.
- Reading git history, including land commits and their trailers.
- Planning cost. The digest's cost is what the executor attempts reported in
  task events. `osq report` already covers planning cost.
- Rewriting the Goal. It is printed verbatim, so any relative paths the
  planner wrote in it stay. The digest itself adds no paths.

## Surface

- Added: `osq digest [ids...]` (command)
- Added: `--since <date>`, `--until <date>`, `--json`, `--out <file>`, `--no-cost` (flags of `osq digest`)
- Added: the digest JSON document, `schemaVersion: 1`
- Added: `date` on an ADR read from `decisions/` (the `Date:` line under its heading)

## Decisions

- ADR 001: unchanged; no config loading moves.
- ADR 004: unchanged; the digest never runs the OpenSpec validator.
- ADR 005: unchanged; no validator range check moves.

## Contract

The deltas below are the contract. In short:

### Requirement: Archived change record

The system SHALL read each archived change into one record through
`src/core/report/archive-record.ts`. A field the archive does not hold SHALL
read as null, never as an error.

#### Scenario: Older archive
- **WHEN** an archive has no events, no manifest, or no `## Decisions` section
- **THEN** those fields read as null and the digest prints `not recorded` for them

### Requirement: Change digest

`osq digest` SHALL print a deterministic Markdown or JSON digest of the
archived changes it selects. Each field SHALL come from the archive, and the
digest SHALL never print a path, a tool summary, verify output, or a
result body.

#### Scenario: Range digest
- **WHEN** a human runs `osq digest --since 2026-09-28 --until 2026-10-01`
- **THEN** osq prints period totals, then every change archived on those days in date order

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/metrics-and-reporting/spec.md`: ADDED "Archived change record",
  "Change digest selection", "Change digest content", and "Change digest
  output". MODIFIED "Code ownership" to add `src/cli/digest.ts` and
  `tests/change-digest*.test.ts`.
- `specs/cli-foundation/spec.md`: MODIFIED "Architecture decision records" so
  an ADR also carries its date.

No file is shared between tasks. Task 4 adds two lines to
`src/cli/index.ts`, which only it touches. It also adds lines to `README.md`
and `CHANGELOG.md`.

## Background

**Where the fields come from.** The brief asked to recheck which events carry
cost and elapsed time. Checked against osq's own archive on 2026-10-01:

- Title: the proposal frontmatter `title`.
- Archive date: the UTC calendar day of the last `archived` event in
  `.run/events/change.jsonl`, read by `readLandedAt`. `--since` and `--until`
  compare that day.
- Goal: the proposal's `## Goal` section, through `extractSection`.
- Requirements: each `specs/<capability>/spec.md`, through `parseDelta`.
- ADRs: every `ADR <n>` in the proposal's `## Decisions` section. The rule
  comes from the current decisions folder through `readDecisions`.
- Tasks: `tasks/*.md` counted by `countTasks`. Attempts and dead reasons come
  from `observeTaskStream` and the `dead` events in `.run/events/<n>.jsonl`.
- Halts that needed a human: the manual retries `observeRetries` counts
  across the task streams and `change.jsonl`. A manual retry is one without
  `automatic: true`, so each is a human running `osq retry`.
- Elapsed time: from the trusted approval time, `readManifestApprovedAt`, to
  the archive time. Per-attempt `exited.elapsedSeconds` leaves out time spent
  waiting on a human, so it would understate how long a change took.
- Cost: the sum of finite `cost` values in task streams, as
  `observeTaskStream` collects them. `tokens` events carry it.
- Models: the distinct `model` of `started` events, which carry it since 084,
  plus the planner recorded in the manifest or brief.

**ADR dates.** "ADRs dated inside the range" needs a date, and `Adr` has none.
Every ADR in `decisions/` has a `Date: YYYY-MM-DD` line under its heading, and
003 adds `Revised:` dates after it. Task 1 reads the first date on that line
into `Adr.date` in `decisions.ts`, the one ADR reader the cli-foundation
requirement names, rather than parsing ADR files again in the digest.

**Names.** "digest" already names the approval digest in
`src/core/spec/digest*.ts` and `tests/digest-before-approval.test.ts`. The new
modules are `archive-record*.ts`, `change-digest*.ts`, and
`digest-markdown.ts` under `src/core/report/`, and the tests are
`tests/change-digest-*.test.ts`. That keeps every glob clear of the approval
digest.

**Measured fallout.** Every registered-command test checks with `includes`,
and `src/cli/index.ts` stays under 250 lines because the command registers
through `registerDigestCommand`, as `registerDoctorCommand` does. No test
deep-equals a whole `Adr`, so adding `date` breaks nothing. The README and
CHANGELOG edits only add lines; the docs tests that read those files look for
other sections.
