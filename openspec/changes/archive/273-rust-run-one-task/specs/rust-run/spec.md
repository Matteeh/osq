## ADDED Requirements

### Requirement: Task checkbox tick
`tick_task_checkbox(content: &str, task: &str) -> String` in
`osq-feature-run` SHALL tick a task's checkbox in `tasks.md` text as
TypeScript's `tickTaskCheckboxContent` does. A `- [ ]` item ticks when its
leading `<n>.` or `<n>)` equals the task's number, or, with no number, when
the nearest `## ` heading above starts with that number. A `## ` heading not
starting with a number ends the section. Ticked items, a task that is not a
number, and no match leave the text unchanged.

#### Scenario: Ticked task lists
- **WHEN** `tick_task_checkbox` runs on the row's text and task, where `\n` is a newline
- **THEN** it returns the row's text:

| Text | Task | Result |
|---|---|---|
| `# Tasks\n\n- [ ] 1. A\n- [ ] 2. B\n` | `2` | `# Tasks\n\n- [ ] 1. A\n- [x] 2. B\n` |
| `- [ ] 1) A\n` | `1` | `- [x] 1) A\n` |
| `  - [ ] 01. A` | `1` | `  - [x] 01. A` |
| `## 1. Setup\n\n- [ ] A\n- [ ] B\n## 2. More\n- [ ] C\n` | `1` | `## 1. Setup\n\n- [x] A\n- [x] B\n## 2. More\n- [ ] C\n` |
| `## 1. Setup\n## Notes\n- [ ] A\n` | `1` | `## 1. Setup\n## Notes\n- [ ] A\n` |
| `- [X] 1. A\n- [ ] 1. again\n` | `1` | `- [X] 1. A\n- [x] 1. again\n` |
| `- [ ] 1. A\n` | `x` | `- [ ] 1. A\n` |
| `- [ ] 2. A\n` | `1` | `- [ ] 2. A\n` |

### Requirement: Run feature
`osq-feature-run` SHALL expose `RunFeature`, a unit struct implementing
core's `Feature`, named `run`, with one command named `run`, the summary
`run one task of an approved change once` and the usage `<id> <task>`.
`run` refuses another command with `FeatureError::unknown_command`, and an
argument count other than two with `FeatureError::usage("run", "expected
<id> <task>")`, before it reads any file.

#### Scenario: Run feature calls
- **WHEN** a test reads `RunFeature`'s name and commands, and runs the row's invocation on a root with no `openspec/` folder
- **THEN** the name is `run`, the one command is `run` with that summary and usage, and the invocation gives the row's error:

| Invocation | Error |
|---|---|
| `run` with args `1` | `usage of run: expected <id> <task>` |
| `run` with args `1`, `1`, `x` | `usage of run: expected <id> <task>` |
| `approve` with args `1` | `unknown command: approve` |

### Requirement: Run refusals
Before it writes anything, `run` SHALL load `osq.toml`, then find the first
active change matching the id as rust-approve "Approve lookup" does, and
refuse with `FeatureError::failed("run", ..)` and the text "Run refusal
texts" gives: a config error, no matching change, no `tasks/<task>.md`, an
executor harness other than `pi`, a root outside git, a task holding
`.run/done/<task>`, `.run/dead/<task>.md` or `.run/regressed/<task>.md`,
and a lock another run holds.

#### Scenario: Run refusal texts
- **WHEN** `run` runs with the arguments `1`, `1` on a copy of the run fixture made as "Run outcomes" says, changed as the row says
- **THEN** it fails with the row's text after `run failed: `, and the change folder's files and the git status are as they were before the run:

| Change | Text |
|---|---|
| `osq.toml` holds `[vcs]` with `enabled = "yes"` | `vcs.enabled must be a boolean` |
| arguments `9`, `1` | `Spec "9" not found in <root>/openspec/changes` |
| arguments `1`, `7` | `Task 7 not found in 001-a` |
| `osq.toml` names the executor harness `claude` | `Rust run supports only the pi harness, not claude` |
| `.git` removed | `Rust run needs a git repository at <root>` |
| `.run/done/1` exists | `Task 1 of 001-a is done; nothing to run` |
| `.run/dead/1.md` exists | `Task 1 of 001-a is dead; nothing to run` |
| `.run/regressed/1.md` exists | `Task 1 of 001-a is regressed; nothing to run` |
| `.run/running/1.pid` exists | `Task 1 of 001-a is already running` |

### Requirement: Run lock
Once the refusals pass, `run` SHALL create `.run/running/<task>.pid`
holding `{"pid":<process id>,"startedAt":<epoch ms>}` only when the file
does not exist, as TypeScript's `acquireLock` does, and SHALL remove it
when the run ends, whatever the outcome.

#### Scenario: Lock removed after a run
- **WHEN** a test runs each "Run outcomes" row
- **THEN** after every run, `.run/running/1.pid` does not exist

### Requirement: Run approval check
Before it starts the executor, `run` SHALL compare the trimmed
`.run/approved` with the change folder's seal from rust-storage
`change_folder_seal`. A missing marker or a different seal kills the task
with the reason `spec_conflict` and TypeScript's `runTask` marker texts.

#### Scenario: Approval conflicts
- **WHEN** `run` runs on the run fixture with the row's `.run/approved`
- **THEN** it fails with `task 1 of 001-a died: spec_conflict` after `run failed: `, starts no executor, and `.run/dead/1.md` is the row's text, where `<s>` is the folder's seal and `\n` a newline:

| `.run/approved` | `.run/dead/1.md` |
|---|---|
| missing | `---\nreason: spec_conflict\n---\nSpec has not been approved (missing .run/approved).\n` |
| `sha256:old` and a newline | `---\nreason: spec_conflict\napproved_hash: "sha256:old"\ncurrent_hash: "<s>"\n---\nChange folder modified after approval. Expected sha256:old, computed <s>.\n` |

### Requirement: Dead record
A task that dies SHALL get `.run/dead/<task>.md` with the reason in its
frontmatter, then one `dead` event `{"task":"<task>","reason":"<reason>"}`
appended to `.run/events/<task>.jsonl` through core's `event_line`, with
the UTC time as `YYYY-MM-DDTHH:MM:SS.mmmZ`. `run` then fails with `task
<task> of <folder> died: <reason>`. Events reach TypeScript's readers as
they are (ADR 025).

#### Scenario: Dead event
- **WHEN** a test runs each "Run outcomes" row whose result is a reason
- **THEN** the last line of `.run/events/1.jsonl` parses with core's `parse_event_line` as a `dead` event for task `1` with the row's reason

### Requirement: Executor start
`run` SHALL start pi once through the runners kernel's `run_task` with
`PiHarness::from_config`, the executor role, no start retries, the task
timeout, the process environment and `executor_prompt` for attempt 1. It
appends `started`, each harness event, then `exited`. A failed start or a
nonzero exit kills it as `crashed`, a timeout as `timeout`, unless the
result file was written during the start. A usage limit fails the run
without a marker.

#### Scenario: Executor exits
- **WHEN** a test runs the "Run outcomes" rows `crash` and `crash-after-result`
- **THEN** `.run/events/1.jsonl` holds a `started` event with the harness `pi` and attempt 1, then an `exited` event with exit code 3; `crash` dies as `crashed`, and `crash-after-result` has an `exit_continued` event after `exited` and is done

### Requirement: Run scope audit
`run` SHALL read git status before and after the start, hash each listed
file, and audit, with core's `audit_scope`, each path whose code or hash
changed. The test folders are `tests` and `benches` beside the nearest
`Cargo.toml` of each path, and the lock rules are Rust's and TypeScript's.
An outside path gives a `scope_violation` event and death; otherwise a
frozen test kills the task as `undeclared_test_change`.

#### Scenario: Scope outcomes
- **WHEN** a test runs the "Run outcomes" rows `outside` and `frozen`
- **THEN** `outside` dies as `scope_violation`, with a `scope_violation` event whose files are `other.txt` and a dead marker whose body is `other.txt`, and `frozen` dies as `undeclared_test_change`, with a dead marker listing `- src/tests/old.rs`

### Requirement: Run verdict
After the audit, `run` SHALL kill the task as `no_result` without
`.run/results/<task>.md`, as `blocked` when its `## Blocked` section has
text, then run the task's verify and the proposal's verify with
rust-harnesses `run_verify`, appending a `verify_ran` event to the task's
and to `change.jsonl`, and kill it as `verify_red` or `change_verify_red`
when one fails.

#### Scenario: Run outcomes
- **WHEN** `run` runs with the arguments `1`, `1` on a git repository made in a new folder under `CARGO_TARGET_TMPDIR` from `crates/features/run/tests/fixtures/run-project/`, all committed, with an `osq.toml` naming the executor harness `pi` and the crate's fake pi as `pi.bin`, `.run/approved` holding the change folder's seal, and `fake-pi-mode` holding the row's mode
- **THEN** the task ends as the row says:

| Mode | The fake pi | Result |
|---|---|---|
| `done` | writes `src/a.txt` and the result file | done |
| `no-file` | writes the result file | `verify_red` |
| `breaks-change` | writes `src/a.txt`, `src/broken.txt` and the result file | `change_verify_red` |
| `no-result` | writes `src/a.txt` | `no_result` |
| `blocked` | writes `src/a.txt` and a result file with `## Blocked` holding `need a key` | `blocked` |
| `outside` | writes `src/a.txt`, `other.txt` and the result file | `scope_violation` |
| `frozen` | writes `src/a.txt`, changes `src/tests/old.rs` and writes the result file | `undeclared_test_change` |
| `crash` | exits 3 | `crashed` |
| `crash-after-result` | writes `src/a.txt` and the result file, then exits 3 | done |

### Requirement: Done record
A task whose verdict passes SHALL get `.run/done/<task>` holding the UTC
time as `YYYY-MM-DDTHH:MM:SS.mmmZ` and a newline, then a `done` event
`{"task":"<task>"}` in `.run/events/<task>.jsonl`, and its checkbox ticked
in `tasks.md` with `tick_task_checkbox`. `run` then returns
`Task <task> of <folder> done` and a newline.

#### Scenario: Done task
- **WHEN** a test runs the "Run outcomes" row `done`
- **THEN** the output is `Task 1 of 001-a done\n`, `.run/done/1` holds one time and a newline, the last event of `.run/events/1.jsonl` is `done` for task `1`, `change.jsonl` holds a `verify_ran` event, and `tasks.md` reads `- [x] 1. When run, it works`
