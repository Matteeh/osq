## ADDED Requirements

### Requirement: Task sizes
`read_task_sizes(folder: &Path) -> Vec<TaskSize>` in `osq-kernel-storage`
SHALL give the measured tasks of one change folder, as TypeScript's
`projectMeasuredTasks` in `src/core/report/report.ts` measures them. It
lists the names in `<folder>/tasks/` that end in `.md`, ordered by leading
number when both names have one that differs, else by bytes, and takes
each name without `.md` as the task id. A missing `tasks/` folder gives no
task. Each task's stream `<folder>/.run/events/<task>.jsonl` is read as
rust-storage "Task history" reads one: blank lines and lines that are not
a JSON object are skipped, a type is the `type` member and data the `data`
member when that is an object. An event's timestamp is its `timestamp`
member when that is a string `timestamp_ms` reads. A task whose stream is
missing or cannot be read gives no entry, and so does a task whose stream
has no start measure.

The start measure is the first `measures` event whose data's `phase` is
`start` and whose data's `scopeFiles` is a finite number of at least 0.
`TaskSize` SHALL be public, exported from the crate root, derive `Debug`,
`Clone` and `PartialEq`, and hold:

- `task: String`, the task id;
- `title: String` and `acceptance_lines: usize`, the title and the number
  of acceptance items of `tasks/<task>.md` as `parse_task_file` in
  `osq-kernel-specs` reads them; an empty title and 0 when the file cannot
  be read or does not parse;
- `scope_files: f64`: the number of keys of the data's `scopeHashes` of
  the last `measures` event whose phase is `end` and whose `scopeHashes`
  is a JSON object, else the start measure's `scopeFiles`;
- `resolver: ScopeResolver`, from the start measure's data
  `scopeResolver`: `Legacy` when the member is absent, `Second` when it is
  the number 2, and `Other` for any other value, `null` included;
- `attempts: u64`, the number of `started` events;
- `first_attempt_pass: bool`, true when a `done` event comes after the
  first `started` event and before any later `started`, `dead` or
  `regressed` event;
- `duration_ms: Option<i64>`: going through the `measures` events in file
  order, each whose phase is `start` sets the open start to its timestamp,
  or to none without one. Each whose phase is `end` adds its timestamp less
  the open start when both are known and the end is not earlier, then
  clears the open start. It is none when no `end` added anything, and
  `Some(0)` when only zero lengths were added.

`ScopeResolver` SHALL be a public enum with the unit variants `Legacy`,
`Second` and `Other`, exported from the crate root, deriving `Debug`,
`Clone`, `Copy`, `PartialEq` and `Eq`.

#### Scenario: Task sizes of task streams
- **WHEN** a test writes a change folder with one task file `tasks/1.md`, titled `When one runs, it passes` with three acceptance items, and the row's lines in `.run/events/1.jsonl`, each line written as `<type> <timestamp> <data>` with every timestamp on `2026-10-20`, then calls `read_task_sizes` on the folder
- **THEN** it gives the row's single `TaskSize`, with task `1`, that title and 3 acceptance lines, or no entry for `none`:

| Lines | scope_files | resolver | attempts | first_attempt_pass | duration_ms |
|---|---|---|---|---|---|
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":2}`, started `08:00:01.000Z`, done `08:01:00.000Z`, measures `08:01:00.000Z` `{"phase":"end"}` | 2 | `Legacy` | 1 | true | 60000 |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":3,"scopeResolver":2}`, started `08:00:05.000Z`, done `08:30:00.000Z`, measures `08:30:00.000Z` `{"phase":"end","scopeHashes":{"a":"1","b":"2","c":"3","d":"4","e":"5","f":"6","g":"7","h":"8","i":"9"}}` | 9 | `Second` | 1 | true | 1800000 |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":1,"scopeResolver":3}`, started `08:00:01.000Z`, done `08:06:00.000Z` | 1 | `Other` | 1 | true | none |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":1,"scopeResolver":null}`, started `08:00:01.000Z` | 1 | `Other` | 1 | false | none |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":5}`, started `08:00:01.000Z`, dead `08:02:00.000Z`, measures `08:02:00.000Z` `{"phase":"end"}`, the line `not json`, started `08:10:00.000Z`, measures `08:10:00.000Z` `{"phase":"start","scopeFiles":6}`, done `08:12:00.000Z`, measures `08:12:30.000Z` `{"phase":"end"}` | 5 | `Legacy` | 2 | false | 270000 |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":-1}`, measures `08:00:01.000Z` `{"phase":"start","scopeFiles":4}`, started `08:00:02.000Z`, regressed `08:00:03.000Z`, done `08:00:04.000Z` | 4 | `Legacy` | 1 | false | none |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":2}`, measures `08:00:00.000Z` `{"phase":"end","scopeHashes":["a"]}`, started `08:00:01.000Z`, done `08:00:02.000Z` | 2 | `Legacy` | 1 | true | 0 |
| measures `08:05:00.000Z` `{"phase":"start","scopeFiles":2}`, measures `08:04:00.000Z` `{"phase":"end"}`, measures `bad` `{"phase":"start","scopeFiles":2}`, measures `08:06:00.000Z` `{"phase":"end"}` | 2 | `Legacy` | 0 | false | none |
| started `08:00:00.000Z`, done `08:01:00.000Z` | none | none | none | none | none |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":"2"}` | none | none | none | none | none |

#### Scenario: Task files without a measured stream
- **WHEN** a test writes a change folder with the task files `10.md`, `2.md`, `notes.txt` and `3.md`, where `2` and `10` have the stream of the first row of "Task sizes of task streams", `3` has none, and `10.md` holds `not a task`, then calls `read_task_sizes` on it, and also calls it on a folder with no `tasks/` folder
- **THEN** the first call gives the tasks `2` and then `10`, where `2` has the title `When one runs, it passes` and 3 acceptance lines and `10` has an empty title and 0 acceptance lines, and the second call gives no task

### Requirement: Dependencies added
`read_dependencies_added(folder: &Path) -> Vec<DependencyPair>` in
`osq-kernel-storage` SHALL give the distinct packages one change folder's
tasks added, as TypeScript's `collectDependencies` reads them for one
folder. It reads every file in `<folder>/.run/events/` whose name is
digits and `.jsonl`, as rust-storage "Task history" reads a stream. Each
`dependencies_added` event's data `added`, when it is an array, gives one
pair for each entry that is a JSON object whose `file` and `name` are
strings that are not blank after JavaScript's `trim`; the pair holds them
trimmed. Equal pairs count once, and the pairs are sorted by `file` and
then by `name`, by bytes. A missing folder gives none.

`DependencyPair` SHALL be public, exported from the crate root, derive
`Debug`, `Clone`, `PartialEq` and `Eq`, and hold `file: String` and
`name: String`.

#### Scenario: Dependencies of task streams
- **WHEN** a test writes a change folder whose `.run/events/` holds the row's files, each holding `dependencies_added` events with the given `added` data, then calls `read_dependencies_added` on it
- **THEN** it gives the row's pairs, each written as `<name> (<file>)`, in order:

| Event files | Pairs |
|---|---|
| `1.jsonl`: `[{"file":"package.json","name":"zod"},{"file":"package.json","name":"zod"},{"file":" Cargo.toml ","name":" serde "},{"file":"","name":"empty-file"},{"file":"Cargo.toml","name":7},"bad"]`; `2.jsonl`: `[{"file":"Cargo.toml","name":"anyhow"}]` | `anyhow (Cargo.toml)`, `serde (Cargo.toml)`, `zod (package.json)` |
| `1.jsonl`: `{"file":"Cargo.toml","name":"serde"}`, which is not an array | none |
| `change.jsonl` and `1.json`: `[{"file":"Cargo.toml","name":"serde"}]` | none |
| `1.jsonl`: the line `not json`, then `[{"file":"b","name":"x"},{"file":"a","name":"y"}]` | `y (a)`, `x (b)` |
| no `.run/events/` folder | none |

### Requirement: Change fixes
`read_change_fixes(folder: &Path) -> Vec<String>` in `osq-kernel-storage`
SHALL give the change ids a change folder names in `fixes`, as
TypeScript's `parseSpecMdFromFolder` reads them. It reads
`<folder>/proposal.md`, or `<folder>/spec.md` when there is no
`proposal.md`, with `parse_proposal` in `osq-kernel-specs`, and gives its
`fixes` in order. No file, an unreadable file or one that does not parse
gives none.

#### Scenario: Fixes of change folders
- **WHEN** a test writes the row's files into a new change folder and calls `read_change_fixes` on it
- **THEN** it gives the row's ids:

| Files | Fixes |
|---|---|
| `proposal.md` with `fixes: [201, "201"]` | `201`, `201` |
| `proposal.md` with `fixes: [1, abc]` | `001`, `abc` |
| `proposal.md` without `fixes` | none |
| `spec.md` with `fixes: [7]` | `007` |
| `proposal.md` without `fixes` and `spec.md` with `fixes: [7]` | none |
| `proposal.md` holding `---` then `fixes: [` then `---` | none |
| no file | none |

### Requirement: Result disclosure reader
`read_result_disclosures(folder: &Path) -> Vec<TaskDisclosure>` in
`osq-kernel-storage` SHALL be public, exported from the crate root, and
give the disclosures of one change folder that rust-storage "Result
disclosures" gives `read_change`'s snapshot, in the same order.

#### Scenario: Disclosure reader on the files fixture
- **WHEN** a test calls `read_result_disclosures` on `archive/001-told` and `archive/002-silent` of the files fixture project
- **THEN** the first gives the three disclosures that "Disclosures of the files fixture" lists, in its order, and the second gives none
