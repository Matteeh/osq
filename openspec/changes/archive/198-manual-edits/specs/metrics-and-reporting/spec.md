## ADDED Requirements

### Requirement: Manual edits query table
`osq query` SHALL also build `manual_edits(kept_at, record, comment, paths,
capabilities)` on every call from `readManualEditRecords`, one row per manual
edit record in `kept_at` order, and store it nowhere. `record` is the record's
file name, `comment` its whole comment, and `paths` and `capabilities` its
lists joined with `, `, an empty list reading as the empty string. `osq query`
without a statement SHALL list the table after `recertifications`, with its
columns, as the last line.

#### Scenario: Manual edits of a project
- **WHEN** `openspec/manual/` holds a record kept at `2026-10-15T20:01:02.123Z` with paths `osq.config.ts` and `src/a.ts`, capabilities `cli-foundation`, and the comment `raise the verify timeout`, and a record kept at `2026-10-14T08:00:00.000Z` with path `notes/todo.txt`, no capabilities, and the comment `typo`
- **THEN** `manual_edits` holds exactly these rows:

| kept_at | record | comment | paths | capabilities |
| --- | --- | --- | --- | --- |
| `2026-10-14T08:00:00.000Z` | `2026-10-14T08-00-00-000Z.md` | `typo` | `notes/todo.txt` | `` |
| `2026-10-15T20:01:02.123Z` | `2026-10-15T20-01-02-123Z.md` | `raise the verify timeout` | `osq.config.ts, src/a.ts` | `cli-foundation` |

#### Scenario: No manual edits
- **WHEN** the project has no `openspec/manual/` folder
- **THEN** `osq query "select count(*) as n from manual_edits"` prints `n` and `0`

#### Scenario: Manual edits listed
- **WHEN** `osq query` runs without a statement
- **THEN** it prints `manual_edits(kept_at, record, comment, paths, capabilities)` as the last line, directly after the `recertifications` line, and exits zero

### Requirement: Manual edits in the plan prompt
`buildOpeningPrompt` SHALL append a `## Manual edits` section last, after `##
Recent executor disclosures` when that is present, with the body
`formatManualEditsSection(projectRoot, config)` in
`src/core/report/manual-edits-section.ts` returns, and leave it out when that
is null. A capability of a manual edit record is open when no archived change
whose delta wrote that capability has an `archivedAt` later than the record's
`kept_at`. osq SHALL never block, warn, or write a lint finding, notice or
event from these records.

#### Scenario: No open manual edits
- **WHEN** the project has no manual edit record, or every record's capabilities were written by a change archived after it
- **THEN** the plan prompt has no `## Manual edits` section and is byte for byte the prompt without it

### Requirement: Manual edits section text
The body SHALL be the line `Edits a human kept with osq manual after the last
change that wrote these capabilities. When this change writes one of them,
bring its spec in line with the edit.`, then one line per record with an open
capability, in `kept_at` order: `- <kept_at> <open capabilities joined with ",
">: <first comment line> (<paths joined with ", ">)`. A record with no open
capability SHALL add no line, and with no line the body SHALL be null.

#### Scenario: Open manual edits
- **WHEN** the records are, oldest first, one kept at `2026-10-10T00:00:00.000Z` with capabilities `cli-foundation` and `version-control`, path `osq.config.ts` and comment `raise timeout`; one kept at `2026-10-12T00:00:00.000Z` with no capabilities, path `notes/todo.txt` and comment `typo`; and one kept at `2026-10-13T00:00:00.000Z` with capability `web-inspection`, path `packages/ui/src/a.tsx` and comment `fix label`; and the only archived change wrote `version-control` and archived at `2026-10-11T00:00:00.000Z`
- **THEN** the section's body is exactly:

| line |
| --- |
| `Edits a human kept with osq manual after the last change that wrote these capabilities. When this change writes one of them, bring its spec in line with the edit.` |
| `- 2026-10-10T00:00:00.000Z cli-foundation: raise timeout (osq.config.ts)` |
| `- 2026-10-13T00:00:00.000Z web-inspection: fix label (packages/ui/src/a.tsx)` |

## MODIFIED Requirements

### Requirement: Recertification query table
`osq query` SHALL also build `recertifications(change, task, recertified_at,
outcome, automatic, path, credited_to, source)` on every call, of archived
changes in folder order, from the change files, reading event streams through
the index, and store it nowhere. It SHALL hold one row per attribution entry of
each `recertification` event in each task stream of a change, in numeric
order, and in the entry's order within the event. A task stream is a file
whose name is digits and `.jsonl`.

- `change` is the folder name.
- `task` and `outcome` are the event's `data.task` and `data.outcome`.
- `recertified_at` is the event's `timestamp`.
- `automatic` is `1` when `data.automatic` is `true`, else `0`.
- `path` and `credited_to` are the entry's `path` and `attribution`.
- `source` is `measures` when the entry carries `source: "measures"`, else
  `file_changed` when `credited_to` is a task number, else null.

An event without object `data`, or whose `data.attribution` is not an array,
SHALL add no row; an entry that is not an object SHALL add no row, and a field
of the wrong type SHALL read as null. `osq query` without a statement SHALL
list the table after `pauses`, with its columns.

#### Scenario: Recertifications of one archived change
- **WHEN** the archive holds `007-pricing`, whose `1.jsonl` holds a `recertification` event at `2026-10-15T10:00:00.000Z` with task `1`, outcome `passed`, `automatic: true`, and attribution `[{ path: "src/a.ts (modified)", attribution: "2", source: "measures" }, { path: "src/b.ts (modified)", attribution: "3" }]`, and whose `2.jsonl` holds a `recertification` event at `2026-10-15T11:00:00.000Z` with task `2`, outcome `requeued`, no `automatic` key, and attribution `[{ path: "src/c.ts (deleted)", attribution: "unknown" }]`
- **THEN** `recertifications` holds exactly these rows:

| change | task | recertified_at | outcome | automatic | path | credited_to | source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `007-pricing` | `1` | `2026-10-15T10:00:00.000Z` | `passed` | `1` | `src/a.ts (modified)` | `2` | `measures` |
| `007-pricing` | `1` | `2026-10-15T10:00:00.000Z` | `passed` | `1` | `src/b.ts (modified)` | `3` | `file_changed` |
| `007-pricing` | `2` | `2026-10-15T11:00:00.000Z` | `requeued` | `0` | `src/c.ts (deleted)` | `unknown` | null |

#### Scenario: No recertifications
- **WHEN** no archived change holds a `recertification` event
- **THEN** `osq query "select count(*) as n from recertifications"` prints `n` and `0`

#### Scenario: Recertifications listed
- **WHEN** `osq query` runs without a statement
- **THEN** it prints `recertifications(change, task, recertified_at, outcome, automatic, path, credited_to, source)` directly after the `pauses` line, and exits zero
