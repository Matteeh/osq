## ADDED Requirements

### Requirement: Latest validation
`read_latest_validation(folder: &Path) -> Option<ValidationRun>` SHALL give
the latest readable `validator_ran` event in the folder's
`.run/events/change.jsonl`, as TypeScript's `latestForChange` in
`src/core/report/report-validation.ts` reads it, and never fail.
`ValidationRun` holds `outcome: String` and `findings: u64`. A line is
passed over when it is not a JSON object, its `type` is not
`validator_ran`, its `timestamp` does not read with `timestamp_ms`, its
`data` is not an object, or its `data.outcome` is not a string that is
non-empty once trimmed. A run's `outcome` is that string trimmed, and its
`findings` is the length of `data.findings` when the outcome is `validated`
and `findings` is an array, else 0. Of the readable runs, the one with the
greatest timestamp wins, and of runs with equal timestamps the later line
wins. A missing file, or one with no readable run, gives `None`.

#### Scenario: Latest validator runs
- **WHEN** `read_latest_validation` reads a folder whose `change.jsonl` holds the row's lines, each `validator_ran` unless the row says otherwise
- **THEN** it gives the row's result:

| Lines | Result |
|---|---|
| `failed` at 11:01, then `validated` with 2 findings at 11:05 | `validated`, 2 |
| `timed_out` at 09:05, then `validated` with 1 finding at 09:00 | `timed_out`, 0 |
| `validated` with 3 findings, then ` failed ` with 1 finding, both at 09:00 | `failed`, 0 |
| `validated` whose `findings` is an object | `validated`, 0 |
| outcome `  `; `validated` at the timestamp `yesterday`; the text `not json`; `data` the string `validated` | `None` |
| one `archived` line | `None` |
| no file | `None` |

### Requirement: Task event files
`read_task_event_files(folder: &Path) -> Vec<TaskEventFile>` SHALL give one
entry per task file of the folder, a file directly under `tasks/` whose name
ends with `.md`, in byte order of the names, and never fail. `TaskEventFile`
holds `id: String`, the name without `.md`, and `events: bool`, whether
`.run/events/<id>.jsonl` exists, as TypeScript's `buildMetricsReport` checks
it. A folder with no `tasks/` gives none.

#### Scenario: Task event files of a change
- **WHEN** `read_task_event_files` reads the folder `305-active` of `tests/fixtures/task-event-files`, holding `tasks/1.md`, `tasks/10.md`, `tasks/2.md`, `tasks/notes.txt`, and `.run/events/2.jsonl`, `.run/events/10.jsonl` and `.run/events/change.jsonl`, and then a folder with no `tasks/`
- **THEN** the first gives `1` without events, `10` with events and `2` with events, in that order, and the second gives none

### Requirement: Capability sidecars
`read_capability_sidecars(root: &Path) -> Option<CapabilitySidecars>`
SHALL split the root's living capabilities by whether each has a sidecar,
as TypeScript's `collectCapabilityCoverage` in `src/core/report/report.ts`
does, and never fail. A living capability is a folder directly under
`<root>/openspec/specs/` holding `spec.md`. `CapabilitySidecars` holds
`with_sidecar` and `without_sidecar`, the names of those whose folder holds
`osq.yml` and of the rest, each in byte order. With no living capability it
SHALL give `None`.

#### Scenario: Sidecars of the living specs
- **WHEN** `read_capability_sidecars` reads `tests/fixtures/task-event-files`, whose `openspec/specs/` holds `alpha/spec.md` and `alpha/osq.yml`, `beta/spec.md`, `notes/osq.yml` with no `spec.md`, and a file `index.txt`, and then a root with no `openspec/specs/`
- **THEN** the first gives `with_sidecar` `alpha` and `without_sidecar` `beta`, and the second gives `None`
