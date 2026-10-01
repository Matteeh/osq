## ADDED Requirements

### Requirement: Archived change record
osq SHALL read an archived change into one record through
`src/core/report/archive-record.ts`, which `osq digest` uses and other readers
of the archive MAY reuse. `listArchivedChanges(projectRoot, config)` SHALL
return a record for every archived change folder `listChanges` finds with
location `archived`, in folder order. A record SHALL hold:

- `id`: the folder's leading digits, as written, such as `129`; `folder`: the
  folder name.
- `title`: the proposal frontmatter `title`, or null.
- `archivedAt`: the timestamp `readLandedAt` returns, or null; `archivedOn`:
  its UTC calendar day as `YYYY-MM-DD`, or null.
- `goal`: the proposal's `## Goal` section text through `extractSection`,
  verbatim, or null when the section is missing or empty.
- `capabilities`: one entry per `specs/<capability>/spec.md`, in name order,
  each with the requirement names `parseDelta` reads as `added`, `modified`,
  and `removed`, and the `renamed` pairs as `{ from, to }`, each in delta order.
- `decisions`: the distinct ADR numbers named as `ADR <n>` in the proposal's
  `## Decisions` section, three-digit padded, in numeric order; an empty list
  when the section names none; null when the section is missing.
- `tasks`: `count` from `countTasks`; `attempts`, the sum of
  `observeTaskStream` attempts over the `.run/events/<n>.jsonl` streams;
  `dead`, one `{ task, reason }` per `dead` event in those streams, ordered by
  task number, then stream order; and `halts`, the manual retries
  `observeRetries` counts over those streams and `change.jsonl`. `attempts`,
  `dead`, and `halts` SHALL be null when the archive has no `.run/events`
  folder.
- `elapsedMs`: the milliseconds from `readManifestApprovedAt` to `archivedAt`,
  or null when either is missing or the difference is negative.
- `cost`: the sum of every finite `cost` value in the task streams, or null
  when none reported one.
- `executorModels`: the distinct non-empty `model` values of `started` events
  in the task streams, sorted; `planner`: `readPlannerAttribution` of the brief
  and manifest, or null.

A record SHALL carry no absolute path, and reading SHALL never fail on a
missing or malformed file.

#### Scenario: Complete archive
- **WHEN** an archive holds a proposal with a title, Goal, and Decisions, a delta, task files, task streams with `started`, `tokens`, `dead`, and `retry` events, an approved manifest, and an `archived` event
- **THEN** every field of its record holds the value read from those files

#### Scenario: Older archive
- **WHEN** an archive has only `proposal.md` without a `## Decisions` section, and `tasks/`
- **THEN** `archivedAt`, `decisions`, `attempts`, `dead`, `halts`, `elapsedMs`, `cost`, and `planner` read as null, `executorModels` is empty, and reading does not fail

#### Scenario: Renamed requirement
- **WHEN** a delta has ADDED, MODIFIED, REMOVED, and RENAMED requirements
- **THEN** each name appears under its own kind, and the rename keeps its from and to names

### Requirement: Change digest selection
`osq digest <ids...>` SHALL select archived changes by id, matched as
`matchesFolder` matches a folder. `osq digest --since <date>`, with an
optional `--until <date>`, SHALL select every archived change whose
`archivedOn` falls in that range, both ends included; without `--until` the
range has no end. A date SHALL be written `YYYY-MM-DD`. The selected changes
SHALL be ordered by `archivedOn`, then by id, with undated changes last.
osq SHALL refuse with exit code 1 and print nothing on stdout when:

- ids and `--since` are both given: `Give change ids or --since, not both`
- neither is given: `Give change ids or --since <date>`
- `--until` is given without `--since`: `--until needs --since`
- a date is not `YYYY-MM-DD`: `<flag> is not a YYYY-MM-DD date: <value>`
- `--until` is before `--since`: `--until is before --since`
- an id matches no archived change: `No archived change matches: <id>, <id>`,
  naming every unmatched id in the order given

A range that selects no change SHALL print an empty digest that says so, and
exit zero.

#### Scenario: Range includes both ends
- **WHEN** archives are dated 2026-09-27, 2026-09-28, 2026-09-30, and 2026-10-01 and a human runs `osq digest --since 2026-09-28 --until 2026-09-30`
- **THEN** the digest holds exactly the changes dated 2026-09-28 and 2026-09-30

#### Scenario: Ids in date order
- **WHEN** a human runs `osq digest 12 10` and 10 archived after 12
- **THEN** the digest lists 12 before 10

#### Scenario: Unknown id
- **WHEN** a human runs `osq digest 10 999` and no archive matches 999
- **THEN** osq exits 1 with `No archived change matches: 999`

#### Scenario: Empty range
- **WHEN** no change archived inside the range
- **THEN** the Markdown says `No changes archived from <since> to <until>.`, the JSON `changes` list is empty, and osq exits 0

### Requirement: Change digest content
Each selected change SHALL contribute its id, title, and archive date; its Goal
verbatim; per capability, the requirements it added, modified, removed, or
renamed, by name; each ADR its record names, with that ADR's `rule` from
`readDecisions`; its task count, total attempts, dead attempts with their
reasons, and halts that needed a human; its elapsed time; its cost; and its
models. A field that reads as null SHALL print as `not recorded` in Markdown
and stay null in JSON. A named ADR the decisions folder no longer holds SHALL
keep its number with a null rule.

A range selection SHALL start with period totals: the number of changes; the
requirements added, modified, removed, and renamed; every capability touched,
with the number of selected changes whose delta wrote it, most first, then by
name; the ADRs whose `date` falls in the range, with number, title, and date;
the total halts; and the total elapsed time and cost, each with how many
changes recorded it. An id selection SHALL have no period totals.

#### Scenario: Every field for a fixture archive
- **WHEN** a human digests a complete fixture archive that has a dead attempt with reason `scope_violation`
- **THEN** the digest shows the title, archive date, Goal, requirement names per capability, ADR rules, task count, attempts, the dead task with `scope_violation`, halts, elapsed time, cost, and models

#### Scenario: Period totals
- **WHEN** a range selects two changes that both write `cli-foundation` and one also writes `status-inspection`, and an ADR is dated inside the range
- **THEN** the totals count both changes, list `cli-foundation (2)` before `status-inspection (1)`, and list that ADR

### Requirement: Change digest output
`osq digest` SHALL print Markdown by default and JSON with `--json`. The JSON
SHALL be the digest document with keys sorted by `serializeSortedJson` and
SHALL carry `schemaVersion: 1`, a `selection`, a `period` (null for an id
selection), and `changes`. Each change SHALL have the stable `id` of its
folder's leading digits. Each requirement entry SHALL have the `id`
`<change id>/<capability>/<kind>/<requirement name>`, where kind is `added`,
`modified`, `removed`, or `renamed`; a renamed entry SHALL be named by its new
name and carry `from`. Each ADR entry SHALL have the `id` `ADR-<number>`.

`--out <file>` SHALL write the digest to that file, relative to the current
directory, and print nothing on stdout. Otherwise the digest SHALL go to
stdout. `--no-cost` SHALL leave out every cost and model, in Markdown and JSON.

The digest SHALL never include an absolute path, a change folder's path, a
tool summary, verify output, a `results/` body, or any event field other than
those the record reads. The same archives, decisions, and arguments SHALL
produce byte-identical output; nothing in it SHALL depend on the current time,
the machine, or directory enumeration order.

#### Scenario: JSON document
- **WHEN** a human runs `osq digest 129 --json`
- **THEN** stdout is one JSON document with `schemaVersion` 1, `period` null, and one change with id `129`, stable requirement ids, and `ADR-<number>` ids

#### Scenario: Without cost
- **WHEN** a human runs `osq digest --since 2026-09-28 --no-cost` with and without `--json`
- **THEN** neither output contains a cost, a dollar amount, an executor model, or a planner

#### Scenario: No paths or run output
- **WHEN** an archive's task stream holds `tool` summaries and `verify_ran` output and its result file has a body
- **THEN** neither format contains those texts, the project root, or the archive folder's path

#### Scenario: Byte-identical runs
- **WHEN** a human runs the same digest twice, in Markdown and in JSON
- **THEN** each pair of outputs is byte-identical

#### Scenario: Written to a file
- **WHEN** a human runs `osq digest 129 --out digest.md`
- **THEN** `digest.md` holds the Markdown digest and stdout is empty

#### Scenario: osq's own archive
- **WHEN** `osq digest 129` runs in this repository
- **THEN** the digest shows 129's title and Goal and contains no absolute path

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/core/report/**, src/cli/report.ts, src/cli/digest.ts, tests/report*.test.ts, tests/change-digest*.test.ts, fixture/report/** -->
The Metrics and Reporting capability SHALL own planning-log parsing, metrics
aggregation including rejection history, report generation, the archived
change record and the change digest, report and digest CLI formatting, report
and digest tests, and the deterministic report fixture.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for planning records, delivery reporting, or the change digest
- **THEN** system maps `src/core/report/**`, `src/cli/report.ts`, `src/cli/digest.ts`, `tests/report*.test.ts`, `tests/change-digest*.test.ts`, and `fixture/report/**` to `metrics-and-reporting`
