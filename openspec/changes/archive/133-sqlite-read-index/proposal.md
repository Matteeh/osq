---
title: osq report reads archived changes from a SQLite index that is always safe to delete
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
    - web-inspection
---
## Goal

`osq report` keeps a derived SQLite index of the event streams of archived
changes, in `.osq/index.sqlite` at the project root, and reads an archived
stream from it while the file's size and modification time are unchanged. The
files stay the only source of truth: deleting the index, or finding it
corrupt, locked or unloadable, changes nothing but the next run's speed. An
ADR records that rule.

On this repository a warm `osq report` goes from about 2.7 s to about 2.15 s,
and peak memory from about 265 MB to about 175 MB, with byte-identical output.
The index also gives `agents-query-osq` the table it will query.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/report-index.test.ts` proves the report reads the same with and without
the index, and that a deleted, corrupt, locked, stale or outdated index never
changes the output. `tests/report-index-store.test.ts` proves the store's own
rules.

## Non-goals

- Moving any state, marker or event out of files.
- Indexing anything but event streams of archived changes. Active changes,
  `plan.jsonl`, task files, briefs, manifests and proposals are read from files
  as today.
- `osq serve` (including `--export`), `status`, the inbox, `osq digest` and the plan
  prompt's repository record using the index. The web-inspection spec requires
  every API request to recompute from files; changing that is its own change.
- Reading the remaining small files once. A separate queue item covers it.
- A query command. That is `agents-query-osq`.

## Surface

- Added: `.osq/index.sqlite` and `.osq/.gitignore` at the project root, written by `osq report` (files). `.osq/.gitignore` holds `*`, so git ignores the folder without any change to the project's own `.gitignore`.

## Decisions

None. No accepted ADR governs metrics-and-reporting. Task 2 writes the new
read-index ADR, numbered 008; its rule is under "The new ADR" in Background.

## Contract

### Requirement: Report read index

`osq report` SHALL read an archived change's event stream from the index when
the file's size and modification time match the index, SHALL read the file and
update the index otherwise, and SHALL print the same output as reading every
file.

#### Scenario: Warm index
- **WHEN** `osq report` runs twice on an unchanged project
- **THEN** the second run reads no archived event stream from disk, and both runs print the same report

#### Scenario: Deleted index
- **WHEN** `.osq/index.sqlite` is deleted between two runs
- **THEN** the second run prints the same report and writes the index again

#### Scenario: Another process holds the index
- **WHEN** another connection holds a write lock on the index while `osq report` runs
- **THEN** the report prints the same output, reading from files where it can't use the index

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/metrics-and-reporting/spec.md`: adds "Report index location",
  "Report read index", and "Report index safety".

Two tasks, in order. Task 1 writes the index store,
`src/core/report/stream-index.ts`. Task 2 connects it to the shared reader and
`osq report`, writes ADR 008, and reads task 1's module without changing it.
No file is shared between tasks.

## Background

**Measured on 2026-10-01**, on this repository at 132, with a rough version of
this change in a scratch worktree and a fresh build of both:

| `osq report` | Time | Peak memory |
| --- | --- | --- |
| Without the index (main at 132) | 2.7 s | ~265 MB |
| First run, index built | 3.0 s | ~280 MB |
| Later runs | 2.15 s | ~175 MB |

The index file was 9.5 MB. `osq report --json` was byte-identical with and
without it. Note that the installed `dist/` lagged behind main when this was
measured: it did not contain 132, so `osq report` there still took 4.7 s.

**Why the gain is modest.** After 132, event streams are a small share of the
report's work. One warm run makes about 14,000 file-system calls: task files
are read about twice each, `brief.md` four times, `manifest.json` three and a
half times, `proposal.md` twice, and about 660 `stat` calls come from change
location, plus config loading through jiti. About 0.67 s of the 2.15 s is idle
time waiting on those small reads in sequence. A separate queue item reads
them once; this change does not.

**Where the index lives.** The brief offered a git-ignored path in the project
or `~/.osq/`. The first prototype used
`~/.osq/index/<sha256(realpath(root))>.sqlite`, like the inbox wait log. A full
suite run then left 146 index files in the real home, because many report
tests call `reportCommand` without a `home`. In the project, each test writes
into its own temporary folder. `.osq/.gitignore` containing `*` keeps git
status clean with no change to `.gitignore` or `osq init`. Two CLI report
tests run against fixtures in the repository (`fixture/report` and
`tests/fixtures/report-sizes`), so they leave an ignored `.osq/` there.

**Why only `osq report` uses it.** The web-inspection requirement "Read-only
HTTP transport" says every API request recomputes its document from files and
retains no cache, and `tests/serve.test.ts` checks that a request writes
nothing in the project. In the prototype, that test failed when `/api/report`
used the index. So the index is an option of the report function, off by
default, and only the `osq report` command turns it on.

**What the index holds.** One row per archived event stream: its absolute
path, size, modification time, and the parsed events as JSON, without the
`output` logs 132 already drops. A schema version in a `meta` table lets a
later osq replace the layout by rebuilding. `agents-query-osq` can expose views
over these rows with SQLite's `json_each`.

**`node:sqlite`.** Node 24.21 ships it with SQLite 3.53.4. It loads without an
experimental warning, `@types/node` 24 types it, and `package.json` requires
Node 24, so it is no new dependency and needs no dependency ADR. It is loaded
with a dynamic `import`, so a runtime without it reads files as today.

**The new ADR.** Task 2 writes `decisions/008-sqlite-read-index.md`, accepted,
applying to metrics-and-reporting, with the rule: SQLite is only a derived read
index of osq's files; deleting it changes nothing but speed, and no state lives
only in it.

**Measured fallout.** The prototype passed the whole CLI suite, 2,963 tests,
with ADR 008 and its README index line added. No test pins the ADR count.
`src/cli/report.ts` and `src/core/report/report.ts` are on the line-budget
allow list.
