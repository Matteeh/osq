# rust-run Specification

## Purpose
The run feature hands one task at a time of an approved change to an executor and verifies it. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/run/** -->
The rust-run capability SHALL own the `osq-feature-run` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Run crate ownership
- **WHEN** file ownership is resolved for the run feature
- **THEN** system maps `crates/features/run/**` to rust-run

### Requirement: Executor prompt
`executor_prompt(project_root: &Path, change: &Path, task: &str, prior:
&PriorAttempt) -> Result<String, SpecsError>` in `osq-feature-run` SHALL
return the prompt TypeScript's `buildExecutorPrompt` builds for task `task`
of the change folder `change` under `project_root`, with the default
config. It reads `tasks/<task>.md` with `read_task_file`, failing with its
error, and joins the lines by `\n` with no final newline, every path
relative to `project_root`.

#### Scenario: Executor prompts equal TypeScript's
- **WHEN** `executor_prompt` runs on a fresh copy of `crates/features/run/tests/fixtures/prompt-project/` as the project root, with the row's change folder under `openspec/changes/`, task and prior attempt, after writing `## Changed\n\n- Earlier attempt.\n\nTouched: none\n` to `.run/results/<task>.md` of the change folder when the row says so; the long output is the lines `line <i>: é verify failed` for `i` from 1 to 120, joined by `\n`
- **THEN** it returns exactly the text of the row's golden file in `crates/features/run/tests/fixtures/prompt-golden/`, which TypeScript's `buildExecutorPrompt` printed for the same inputs:

| Golden | Change | Task | Attempt | Reason | Output | Result file |
|---|---|---|---|---|---|---|
| `sample-1-first.txt` | `001-sample` | `1` | 1 | none | none | no |
| `sample-2-retry.txt` | `001-sample` | `2` | 3 | `verify_red` | the long output | yes |
| `sample-1-blank-output.txt` | `001-sample` | `1` | 2 | none | `  \n\t` | no |
| `bare-1-result.txt` | `002-bare` | `1` | 1 | none | none | yes |
| `bare-1-short-output.txt` | `002-bare` | `1` | 2 | `change_verify_red` | `error: one\nerror: two` | no |

#### Scenario: Missing task file
- **WHEN** `executor_prompt` runs on a fresh copy of the prompt fixture with the change `001-sample`, the task `9` and the default prior attempt
- **THEN** it returns the `SpecsError` that `read_task_file` gives for `openspec/changes/001-sample/tasks/9.md`

### Requirement: Prompt spec lists
The prompt SHALL list, as `deltaSpecPaths` and `livingSpecPaths` do, under
`Delta Specs:` each directory directly under `<change>/specs` as
`<change>/specs/<name>/spec.md`, and under `Living Capability Specs:` each
existing `openspec/specs/<name>/spec.md` for the trimmed, non-blank
`features.reads` names and the delta names, each once. Names are in byte
order. An empty list is left out with its blank line and heading. A
proposal `read_proposal` refuses gives no reads.

#### Scenario: Spec lists of the prompt fixture
- **WHEN** `executor_prompt` runs on the prompt fixture for task `1` of each row's change with the default prior attempt; `001-sample` reads `beta`, ` gamma ` and `beta`, writes the deltas `alpha` and `zeta` and holds the file `specs/notes.md`, and the living specs are `alpha`, `beta` and `omega`
- **THEN** the prompt lists the row's paths:

| Change | Delta Specs | Living Capability Specs |
|---|---|---|
| `001-sample` | `openspec/changes/001-sample/specs/alpha/spec.md`, `openspec/changes/001-sample/specs/zeta/spec.md` | `openspec/specs/alpha/spec.md`, `openspec/specs/beta/spec.md` |
| `002-bare` | none, the section left out | none, the section left out |

### Requirement: Prompt capability rules
The prompt SHALL give `Capability Rules:` after the seven executor steps,
as `extractCapabilityRules` does: one `- <capability>: <title> —
<statement>` line, or `- <capability>: <title>` for an empty statement,
per `### Requirement:` line of each delta `spec.md`, capabilities in byte
order and requirements in file order. A requirement whose living spec has
one of the same title and statement is left out, and with no line the
section is left out.

#### Scenario: Capability rules of the prompt fixture
- **WHEN** `executor_prompt` runs on the prompt fixture for task `1` of `001-sample` with the default prior attempt
- **THEN** its `Capability Rules:` section holds exactly these lines, in this order, `Shared rule` being left out since its statement equals the living one:

| Line |
|---|
| `- alpha: New rule — The alpha capability SHALL do the new thing across lines.` |
| `- alpha: Bare rule` |
| `- alpha: Changed rule — The alpha capability SHALL do the new thing instead.` |
| `- alpha: Old rule — **Reason**: New rule replaces it. **Migration**: Use New rule.` |
| `- zeta: Code ownership — The zeta capability SHALL own the \`zeta\` crate.` |

### Requirement: Prompt requirement statements
A requirement's statement SHALL be its text after the header line, up to
the next line starting `### ` or `##` and whitespace other than `#`, cut
before the first line starting `####`, with every HTML comment removed,
each run of JavaScript `\s` whitespace made one space, and the ends
trimmed. Its title is the header line's text after `Requirement:`,
trimmed. The living spec read is `openspec/specs/<capability>/spec.md`;
when it is missing, every rule of the capability is kept.

#### Scenario: Requirement statements
- **WHEN** the capability rules are built from a delta `spec.md` holding the row's requirement
- **THEN** the rule's statement is the row's:

| Requirement text after `### Requirement: New rule` | Statement |
|---|---|
| `\n<!-- source: a/** -->\nThe rule SHALL do\nthe thing   across\tlines.\n\n#### Scenario: S\n- x` | `The rule SHALL do the thing across lines.` |
| `\n#### Scenario: S\n- x` | empty |
| `\nFirst <!-- a\nb --> part.\n\n## REMOVED Requirements` | `First part.` |
| `\nOne\u{a0}two\u{feff}three` | `One two three` |

### Requirement: Prompt prior context
`PriorAttempt` SHALL hold `attempt: u32`, `reason` and `output`, both
`Option<String>`, by default attempt 1 with neither. As
`priorContextLines` does, the prompt gives a blank line, `Prior Context:`
and `- Prior Attempt: <n>` when the attempt is over 1, the reason is not
empty, the output is not blank or the task's result file exists; then
`- Prior Failure: <reason>`, `- Prior Failure Output:` with each output
line indented two spaces, and `- Prior Result: <path>`, each when it
applies.

#### Scenario: Prior context of the prompt fixture
- **WHEN** `executor_prompt` runs as the rows of "Executor prompts equal TypeScript's" say
- **THEN** the prompt's prior context is the row's:

| Golden | Prior context lines |
|---|---|
| `sample-1-first.txt` | none |
| `sample-1-blank-output.txt` | `Prior Context:`, `- Prior Attempt: 2` |
| `bare-1-result.txt` | `Prior Context:`, `- Prior Attempt: 1`, `- Prior Result: openspec/changes/002-bare/.run/results/1.md` |
| `bare-1-short-output.txt` | `Prior Context:`, `- Prior Attempt: 2`, `- Prior Failure: change_verify_red`, `- Prior Failure Output:`, `  error: one`, `  error: two` |

### Requirement: Prompt output bound
The prior failure output SHALL be bounded as TypeScript bounds it: an
output longer than 2000 UTF-16 code units keeps its first 2000 code units
followed by `…`, and a shorter one is kept whole.

#### Scenario: Output bounds
- **WHEN** the prompt's prior failure output is the row's text, given with attempt 2
- **THEN** the lines after `- Prior Failure Output:` hold the row's kept text:

| Output | Kept text |
|---|---|
| 2000 `a` characters | the 2000 characters |
| 2001 `a` characters | 2000 `a` characters and `…` |
| 1999 `a` characters and `é` | the whole output |
| 1999 `a` characters, `é` and `b` | 1999 `a` characters, `é` and `…` |

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
