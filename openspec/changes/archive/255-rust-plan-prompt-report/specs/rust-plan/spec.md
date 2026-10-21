## MODIFIED Requirements

### Requirement: Plan prompt
`plan` SHALL write `plan-prompt.md` into the new change folder: the
sections TypeScript's `buildBaseOpeningPrompt` in `src/cli/plan-queue.ts`
gives under `DEFAULT_CONFIG`, each trimmed and joined by an empty line,
then the sections TypeScript's `buildOpeningPrompt` in `src/cli/plan.ts`
appends after them with no steering section, with no newline at the end:

1. The text of `<root>/PLANNER.md`, or `# Planning a change for osq` when it
   cannot be read.
2. The lines `# Change: <id> - <title>`, `Change ID: <id>` and
   `Change Folder: <folder>`, then, when the item has dependencies,
   `Landed dependencies:` and one line `- openspec/changes/archive/<folder>`
   per dependency's archived folder, in the item's order, joined by
   newlines. `<title>` is the new `proposal.md`'s `title` as rust-storage
   `frontmatter_string` reads it, or empty text when it gives none.
3. `## Capability Specs`, an empty line,
   ``All living specs. Read the requirements this change writes or whose code it uses, not whole specs: `osq spec <capability>` lists them and `osq spec <capability> <requirement>` prints one.``,
   an empty line, and one line `- openspec/specs/<name>/spec.md` per folder
   directly in `<root>/openspec/specs/`, sorted by name.
4. Only when rust-specs `read_decisions` with the folders `decisions` and
   `openspec` gives an ADR whose status is `accepted`:
   `## Architecture Decisions`, an empty line,
   `Read in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.`,
   an empty line, and one line per accepted ADR in the order
   `read_decisions` gives,
   `- ADR <number>: <title>. Applies to: <scope>. Rule: <rule> Path: <path>`,
   where `<scope>` is `all` for an ADR that applies to all, and otherwise
   its `applies_to` names as written, joined by `, `, or empty text when it
   has none.
5. `## Brief`, an empty line and the new `brief.md`.
6. `## This repository's record`, an empty line and the body "Repository
   record section" gives.
7. Only when "History hints section" gives a body: `## What history says`,
   an empty line and that body.
8. Only when "Disclosures section" gives a body:
   `## Recent executor disclosures`, an empty line and that body.
9. Only when "Manual edits section" gives a body: `## Manual edits`, an
   empty line and that body.

Sections 6 to 9 are written as their bodies give them, not trimmed. Their
bodies read `read_history` of the root, the archived snapshots among them,
`read_manual_edits` of the root and `task_outcomes` over those snapshots
with the ownership rust-specs `read_capability_ownership` reads from
`<root>/openspec/specs`. When `read_history` fails, `plan` SHALL fail with
`Cannot read the archive: <error>` and write no change folder.

#### Scenario: Prompt sections
- **WHEN** `PlanFeature::at(1792584000000)` runs `plan` with the args `--next` on a root whose `openspec/queue.md` holds `## [a] A\n\nDepends on: nothing\n\nA.\n`, written with `\n` escapes, and which holds the row's files
- **THEN** the new folder's `plan-prompt.md` is the row's text, written with `\n` escapes, where `<brief>` is the new `brief.md` trimmed, `<specs>` is the third section's heading, empty line and sentence with no line after them, and `<record>` is `## This repository's record\n\nThis repository's measured record is too small (fewer than 5 tasks).`:

| Files | Prompt |
|---|---|
| none | `# Planning a change for osq\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n## Brief\n\n<brief>\n\n<record>` |
| `PLANNER.md` holding `\n  Plan well.\n\n`, and folders `openspec/specs/zeta/` and `openspec/specs/eta/` and the file `openspec/specs/readme.md` | `Plan well.\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n- openspec/specs/eta/spec.md\n- openspec/specs/zeta/spec.md\n\n## Brief\n\n<brief>\n\n<record>` |
| `decisions/001-x.md` holding `---\nstatus: proposed\napplies_to: all\nrule: R.\n---\n# 1. X\n` | `# Planning a change for osq\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n## Brief\n\n<brief>\n\n<record>` |
| `decisions/007-x.md` holding `---\nstatus: accepted\napplies_to: [beta]\nrule: R.\n---\n# 7. X\n` | `# Planning a change for osq\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n## Architecture Decisions\n\nRead in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.\n\n- ADR 007: X. Applies to: beta. Rule: R. Path: decisions/007-x.md\n\n## Brief\n\n<brief>\n\n<record>` |

#### Scenario: Archive that cannot be read
- **WHEN** `plan --next` runs on a root whose queue holds one item and whose archived change `001-x` holds a task stream `.run/events/1.jsonl` with the line `not json`
- **THEN** it fails with a message that starts `Cannot read the archive: `, and `openspec/changes/` holds no new folder

### Requirement: TypeScript plan parity
The files `plan` writes into the new change folder and its output SHALL be
the ones TypeScript writes and prints for the same repository on the same
UTC date, byte for byte, where TypeScript's are the folder
`createQueueChange` writes under `DEFAULT_CONFIG` with no planner model,
without its `.run/` folder, its `plan-prompt.md` holding
`buildOpeningPrompt`'s prompt with no steering section, and the handoff
`formatPlanHandoff` gives with the next step `readNextStep` reads for the
new folder.

#### Scenario: Golden change folder
- **WHEN** `PlanFeature::at(1792584000000)` runs `plan` with the args `--next` on a fresh scratch copy of `tests/fixtures/plan-repo`, whose queue holds the items `alpha`, landed, `beta`, which depends on and fixes `alpha`, and `gamma`, which depends on `beta`, and which holds a rejected change `004-old-idea`, a `PLANNER.md`, two living specs and accepted, proposed and ignored decision files
- **THEN** the root's `openspec/changes/` holds the new folder `005-beta`, which holds exactly the files of `tests/fixtures/plan-created/005-beta`, which TypeScript wrote for the same fixture, each equal byte for byte, and the output equals `tests/fixtures/plan-created/handoff.txt` with each `<root>` replaced by the scratch copy's path shown with `display()`

## ADDED Requirements

### Requirement: Repository record section
The body of the prompt's `## This repository's record` section SHALL be
the one TypeScript's `formatRepositoryRecordBody(getRepositoryRecord(root))`
in `src/core/report/report.ts` gives.

- The window is the 20 archived snapshots with the highest leading
  number, ties by folder name, folders with no leading number after the
  numbered ones by name.
- A measured task is a task of a window snapshot, in window order and
  then task order, whose outcome has `start_scope_files`. Its scope files
  are the number of `scope_hash_paths` when it has them, else
  `start_scope_files`; its acceptance lines are the task plan's
  `acceptance` count; its generation is legacy without
  `start_scope_resolver`, resolver 2 when it is 2, and neither otherwise.
- With fewer than 5 measured tasks the body is
  `This repository's measured record is too small (fewer than 5 tasks).`
- Otherwise it is these lines joined by `\n`:
  - `First-attempt passes: <passed>/<measured>`, counting the measured
    tasks whose `first_attempt_passed` is true.
  - `Largest first-attempt pass: <folder>/<task> "<title>" (scope files: <n>, acceptance lines: <n>)<label>`
    for the passing task with the most scope files, then the most
    acceptance lines, then the lower change leading number and the lower
    task number, among the resolver 2 measured tasks when there is one,
    else among the legacy ones; `<label>` is ` [resolver 2 scope]` or
    ` [legacy scope]` by the generation used. With no such task the line
    is `Largest first-attempt pass: unavailable`.
  - `Median task duration: <duration>`, the median of the measured tasks'
    `measured_ms` in seconds, the mean of the middle two for an even
    count, rounded to two decimals half up, then shown as TypeScript's
    `formatDuration` shows it: `0s` at zero, whole seconds rounded half
    up, `<s>s` under a minute, else `<m>m <s>s`, or `<m>m` when the
    seconds are 0. Without any `measured_ms` it is
    `Median task duration: unavailable`.
  - `Dead outcomes:`, then one line `- <folder>, <task title>, <reason>`
    per dead event of a window snapshot's task streams, in window order,
    task order and line order, the first 10, `<reason>` trimmed or
    `unknown` when blank; or the one line `  (none)` without any.

#### Scenario: Repository record bodies
- **WHEN** `plan --next` runs on a root holding the row's archived changes, built under `CARGO_TARGET_TMPDIR`
- **THEN** the record section's body is the row's:

| Archive | Body |
|---|---|
| none | `This repository's measured record is too small (fewer than 5 tasks).` |
| 4 measured tasks, all passing | `This repository's measured record is too small (fewer than 5 tasks).` |
| 5 measured legacy tasks, none passing, none with an `end` measure, no dead event | `First-attempt passes: 0/5\nLargest first-attempt pass: unavailable\nMedian task duration: unavailable\nDead outcomes:\n  (none)` |
| 5 measured tasks of `001-a` titled `T<n>`, tasks 1 and 2 passing legacy tasks with 9 scope files, task 2 with more acceptance lines, task 3 a passing resolver 2 task with 1 scope file and 2 acceptance lines, measured 30, 90 and 600 seconds, and task 4 dead with reason `verify_red` | `First-attempt passes: 3/5\nLargest first-attempt pass: 001-a/3 "T3" (scope files: 1, acceptance lines: 2) [resolver 2 scope]\nMedian task duration: 1m 30s\nDead outcomes:\n- 001-a, T4, verify_red` |
| 5 measured passing legacy tasks of `001-a`, all with 2 scope files and one acceptance line, measured 1, 2, 3 and 4 seconds | `First-attempt passes: 5/5\nLargest first-attempt pass: 001-a/1 "T1" (scope files: 2, acceptance lines: 1) [legacy scope]\nMedian task duration: 3s\nDead outcomes:\n  (none)` |
| 21 archived changes `001-a` to `021-a`, each one measured task that died with `timeout`, plus 12 dead events in `021-a` | `First-attempt passes: 0/20` first, and exactly 10 dead lines, all of `021-a` |

### Requirement: History hints section
The body of the prompt's `## What history says` section SHALL be the one
TypeScript's `formatHistoryHints` in `src/core/report/history-hints.ts`
gives under `DEFAULT_PLANNING_HISTORY` (`minimumTasks` 30, `recentTasks`
100, `maxCharacters` 1500), over the `task_outcomes` rows whose `attempts`
is at least 1.

- With fewer than 30 such rows there is no body and no section.
- The window is the 100 newest rows: the higher change leading number
  first, numbered changes before the others, which go by change name from
  the last; then the higher task number, and tasks that are not numbers by
  task text.
- The lines are, in this order, each present only when one of its groups
  holds a row, the groups with rows written `<label> <passed>/<rows>` and
  joined by `, `, `<passed>` counting rows whose `first_attempt` is 1:
  `Counts from the last <window rows> archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them.`
  (always present), `First attempt by scope files: ` with `1-2`, `3-4`,
  `5-8` and `over 8` by `scope_files`, a row without one in none;
  `First attempt by verify kind: ` with `one`, `several`, `suite` and
  `other`; `First attempt by tests.modify: ` with `true` (1) and `false`;
  `First attempt by shared scope: ` with `shared` (1) and `not shared`;
  `First attempt by position: ` with `first task` (1) and `later task`;
  and `Most common last dead reasons: ` with at most three non-empty
  `dead_reason` values as `<reason> <rows>`, most rows first and then by
  name, or `none` without any (always present).
- Lines are kept in order while their length, counted in UTF-16 code
  units as JavaScript counts it, with one `\n` between kept lines, stays
  within 1500; the body is the kept lines joined by `\n`, and none when
  even the first line does not fit.

#### Scenario: History hint bodies
- **WHEN** `plan --next` runs on a root whose archive gives the row's `task_outcomes` rows that ran, built under `CARGO_TARGET_TMPDIR`
- **THEN** the history section is the row's:

| Rows that ran | History section |
|---|---|
| 29 | none |
| 30, every row in change `001-a` with 3 scope files, verify `node --test a.test.ts`, no tests.modify, unshared scope, all passing and no dead reason | `Counts from the last 30 archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them.\nFirst attempt by scope files: 3-4 30/30\nFirst attempt by verify kind: one 30/30\nFirst attempt by tests.modify: false 30/30\nFirst attempt by shared scope: not shared 30/30\nFirst attempt by position: first task 1/1, later task 29/29\nMost common last dead reasons: none` |
| 101 tasks in changes `001-a` to `101-a`, one each, where `001-a`'s task alone has 9 scope files | the counts line names `the last 100`, and the scope line holds no `over 8` group |
| 30 tasks whose dead reasons are `timeout` 2, `blocked` 2, `verify_red` 2 and `crashed` 1 | the last line is `Most common last dead reasons: blocked 2, timeout 2, verify_red 2` |

### Requirement: Disclosures section
The body of the prompt's `## Recent executor disclosures` section SHALL be
the one TypeScript's `formatRecentDisclosures` in
`src/core/report/recent-disclosures.ts` gives under
`DEFAULT_PLANNING_DISCLOSURES` (`recentChanges` 3, `maxCharacters` 4000).

- The changes are the 3 archived snapshots the record's window puts
  first. Each disclosure of each, in their order, gives one entry per
  non-empty section, in the order `deviated`, `missing_context` and
  `outside_scope`, shown as `deviated`, `missing context` and
  `outside scope`:
  `<folder> task <task>, <shown name>:\n` and the section's lines, split
  on `\n` or `\r\n`, each prefixed `> ` and joined by `\n`.
- Without any entry there is no body and no section.
- Entries are kept while their total length, in UTF-16 code units and not
  counting separators, stays within 4000. The first entry that does not
  fit is cut to the larger of what is left and 11, and nothing follows
  it: when it is longer than that limit, its first `limit - 11` code
  units with trailing `\n` removed, then `[truncated]`, or `[truncated]`
  alone when nothing is left before it.
- The body is
  `Executor claims from result files, not verified facts. Check them against the code before relying on them.`,
  an empty line, and the kept entries joined by an empty line.

#### Scenario: Disclosure bodies
- **WHEN** `plan --next` runs on a root holding the row's archived changes and result files, built under `CARGO_TARGET_TMPDIR`
- **THEN** the disclosures section is the row's, where `<claim>` is the claim sentence above:

| Archive | Disclosures section |
|---|---|
| `001-a` with `.run/results/1.md` holding only `## Changed` | none |
| `001-a` with `.run/results/2.md` holding `## Deviated\n\nUsed a map.\nSecond line.\n\n## Outside scope\n\nA bug.\n` | `<claim>\n\n001-a task 2, deviated:\n> Used a map.\n> Second line.\n\n001-a task 2, outside scope:\n> A bug.` |
| `001-a` to `004-a`, each with `.run/results/1.md` holding `## Missing context\n\nNo <folder>.\n` | `<claim>\n\n004-a task 1, missing context:\n> No 004-a.\n\n003-a task 1, missing context:\n> No 003-a.\n\n002-a task 1, missing context:\n> No 002-a.` |
| `001-a` with `.run/results/1.md` holding a `## Deviated` section of 5000 `x` | `<claim>\n\n001-a task 1, deviated:\n> ` then `x` up to 3989 code units in all, then `[truncated]` |

### Requirement: Manual edits section
The body of the prompt's `## Manual edits` section SHALL be the one
TypeScript's `formatManualEditsSection` in
`src/core/report/manual-edits-section.ts` gives.

- A record's open capabilities are those of its `capabilities` for which
  no archived snapshot has a delta of that capability and an archive time
  later than the record's `kept_at`: both compared as `timestamp_ms` reads
  them when both read, else as text, and a snapshot without an archive
  time is never later.
- Each record with an open capability, in `read_manual_edits` order,
  gives the line
  `- <kept_at> <open capabilities joined by ", ">: <first line of the comment> (<paths joined by ", ">)`.
- Without any line there is no body and no section. The body is
  `Edits a human kept with osq manual after the last change that wrote these capabilities. When this change writes one of them, bring its spec in line with the edit.`,
  `\n` and the lines joined by `\n`.

#### Scenario: Manual edit bodies
- **WHEN** `plan --next` runs on a root holding the archived change `001-a` with a delta for `alpha`, archived at `2026-10-02T00:00:00.000Z`, and the row's records in `openspec/manual/`
- **THEN** the manual edits section is the row's, where `<intro>` is the intro sentence above:

| Records | Manual edits section |
|---|---|
| none | none |
| kept `2026-10-01T00:00:00.000Z`, capabilities `alpha` | none |
| kept `2026-10-03T00:00:00.000Z`, capabilities `alpha` and `beta`, paths `src/a.rs` and `src/b.rs`, comment `Fixed it.\n\nMore.` | `<intro>\n- 2026-10-03T00:00:00.000Z alpha, beta: Fixed it. (src/a.rs, src/b.rs)` |
| kept `2026-10-01T00:00:00.000Z`, capabilities `alpha` and `beta`, paths `src/a.rs`, comment `Kept.` | `<intro>\n- 2026-10-01T00:00:00.000Z beta: Kept. (src/a.rs)` |
| kept `2026-10-03T00:00:00.000Z`, no capabilities | none |

### Requirement: TypeScript prompt sections parity
The sections `plan` writes after `## Brief` SHALL be the ones TypeScript's
`buildOpeningPrompt` appends after its base prompt for the same
repository under `DEFAULT_CONFIG`, byte for byte.

#### Scenario: Golden history sections
- **WHEN** `PlanFeature::at(1792584000000)` runs `plan` with the args `--next` on a fresh scratch copy of `tests/fixtures/sections/plan-history`, which holds seven archived changes with 37 tasks, their event streams and result files, and three manual edit records
- **THEN** the new folder's `plan-prompt.md`, from `\n\n## This repository's record` on and without that leading empty line, equals `tests/fixtures/sections/plan-history.md`, which TypeScript printed for the same fixture

#### Scenario: Golden archive sections
- **WHEN** the corpus test `tests/prompt_sections_corpus.rs`, ignored by default, builds a scratch root under `CARGO_TARGET_TMPDIR` that holds this repository's archived change folders numbered 001 to 251 and its `openspec/manual/` records kept before `2026-10-21T16:00:00.000Z`, each file hard-linked or else copied, and a queue with one item, and runs `plan --next` on it
- **THEN** the new folder's `plan-prompt.md`, from `\n\n## This repository's record` on and without that leading empty line, equals `tests/fixtures/sections/archive.md`, which TypeScript printed for this repository's archive on 2026-10-21
