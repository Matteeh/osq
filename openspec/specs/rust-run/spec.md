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
timeout, the process environment and `executor_prompt` for the attempt
"Run attempts" gives. It appends `started` with that attempt, each harness
event, then `exited`. A failed start or a nonzero exit kills it as
`crashed`, a timeout as `timeout`, unless the result file was written
during the start. A usage limit pauses it as "Run usage pause" says.

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

Each verify's whole output SHALL go to the next free
`.run/logs/<target>-<n>.log` of the change folder, where `<target>` is the
task for the task's verify and `change` for the proposal's, and `<n>` is
one more than the count of `<target>-<digits>.log` files already there,
with a `.gitignore` holding `*` and a newline written in `.run/logs/` when
it is missing, as TypeScript's `writeVerifyLog` does. The `verify_ran`
event SHALL hold that path as `log`, and as `output` the tail TypeScript's
`tailVerifyOutput` keeps with `limits.markerOutputLines` and
`limits.markerLineChars` from the config, with no `output` when the tail
is empty.

A dead marker's body SHALL hold the excerpt TypeScript's
`excerptVerifyOutput` builds with the same two limits and the log path as
its source: the lines from the last line that starts with `✖ failing
tests:` after its leading whitespace, or else the last
`limits.markerOutputLines` lines, after trailing whitespace is dropped,
each cut to `limits.markerLineChars` characters followed by `… (<rest>
more characters)`, then `Full output: <log>`. Empty output gives `(no
output)` in place of the lines. A red task verify that did not time out
and printed nothing gives the excerpt of `Process exited with code
<code>`, as TypeScript does. A timed-out task verify keeps the excerpt of
its output under `Watcher independent verify timed out:`. No tail size is
a constant in the run crate.

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

#### Scenario: Verify output from the config
- **WHEN** `run` runs with the arguments `1`, `1` on the "Run outcomes" repository with `fake-pi-mode` holding `done`, whose `osq.toml` also holds the row's settings, whose task 1 or proposal has the row's shell command as its `verify`, and whose `.run/approved` holds the change folder's new seal
- **THEN** the task dies with the row's reason, the dead marker's text after its closing `---` line is the row's body, the last `verify_ran` event of the row's stream holds the row's `output`, or none, and `log` `.run/logs/<log>`, that log holds the command's whole output, and `.run/logs/.gitignore` holds `*` and a newline, where `\n` stands for a newline and every body ends with one:

| Settings | Verify | Command | Reason | Body | Stream | `output` | Log |
|---|---|---|---|---|---|---|---|
| `markerOutputLines = 2`, `markerLineChars = 5` under `[limits]` | task | `printf 'one\ntwo\nthree-long\n'; exit 1` | `verify_red` | `Watcher independent verify failed:\ntwo\nthree… (5 more characters)\nFull output: .run/logs/1-1.log\n` | `1.jsonl` | `two\nthree… (5 more characters)` | `1-1.log` |
| none | task | `printf 'ok\n'; exit 1` | `verify_red` | `Watcher independent verify failed:\nok\nFull output: .run/logs/1-1.log\n` | `1.jsonl` | `ok\n` | `1-1.log` |
| none | task | `exit 1` | `verify_red` | `Watcher independent verify failed:\nProcess exited with code 1\nFull output: .run/logs/1-1.log\n` | `1.jsonl` | none | `1-1.log` |
| `markerOutputLines = 1` under `[limits]` | task | `printf 'a\n✖ failing tests:\nb\nc\n'; exit 1` | `verify_red` | `Watcher independent verify failed:\n✖ failing tests:\nb\nc\nFull output: .run/logs/1-1.log\n` | `1.jsonl` | `c` | `1-1.log` |
| `markerOutputLines = 2` under `[limits]`, `taskTimeoutSeconds = 1` under `[timeouts]` | task | `printf 'x\ny\nz\n'; sleep 5` | `verify_red` | `Watcher independent verify timed out:\ny\nz\nFull output: .run/logs/1-1.log\n` | `1.jsonl` | `y\nz` | `1-1.log` |
| `markerOutputLines = 2` under `[limits]` | proposal | `printf 'one\ntwo\nthree\n'; exit 2` | `change_verify_red` | `Change-level verification failed after task verification passed.\ntwo\nthree\nFull output: .run/logs/change-1.log\n` | `change.jsonl` | `two\nthree` | `change-1.log` |

### Requirement: Done record
A task whose verdict passes SHALL get `.run/done/<task>` holding the UTC
time as `YYYY-MM-DDTHH:MM:SS.mmmZ` and a newline, then a `done` event
`{"task":"<task>"}` in `.run/events/<task>.jsonl`, and its checkbox ticked
in `tasks.md` with `tick_task_checkbox`. `run` then returns
`Task <task> of <folder> done` and a newline.

#### Scenario: Done task
- **WHEN** a test runs the "Run outcomes" row `done`
- **THEN** the output is `Task 1 of 001-a done\n`, `.run/done/1` holds one time and a newline, the last event of `.run/events/1.jsonl` is `done` for task `1`, `change.jsonl` holds a `verify_ran` event, and `tasks.md` reads `- [x] 1. When run, it works`

### Requirement: Run attempts
Before it starts pi, `run` SHALL read the task's retry context with
rust-storage `read_retry_context` of the change folder and the task, as
TypeScript's `spawnTaskAgent` does, and hand `executor_prompt` a
`PriorAttempt` holding that attempt, capped at `u32::MAX`, its reason and
its output. The `started` event's `attempt` is that attempt.

#### Scenario: Prior context handed to pi
- **WHEN** a test runs task `1` of a committed scratch copy of the run fixture, with `pi.bin` naming a fake pi that saves the prompt it is given outside the project and then does what the fake pi's `done` mode does, after writing the row's `.run/events/1.jsonl` lines and `.run/dead/` markers as "Retry contexts" in rust-storage writes them
- **THEN** the task is done, its `started` event has the row's attempt, the saved prompt equals `executor_prompt` of the fixture change and task `1` with a `PriorAttempt` of the row's attempt, reason and output, and the prompt's prior context is the row's:

| Run | Lines | Markers | Attempt | Prior context lines |
|---|---|---|---|---|
| first | no event file | none | 1 | none |
| after a retry | `retry 2` | `1.1.md` holding `<marker>` | 2 | `Prior Context:`, `- Prior Attempt: 2`, `- Prior Failure: verify_red`, `- Prior Failure Output:`, `  error: one` |
| after a requeued recertification | `requeued {"attempt":3,"reason":"scope_regression","output":"fail\n"}` | none | 3 | `Prior Context:`, `- Prior Attempt: 3`, `- Prior Failure: scope_regression`, `- Prior Failure Output:`, `  fail` |

### Requirement: Run usage pause
`run` SHALL give the runner a `usage_limit_wait` of 1800 seconds,
TypeScript's default `gates.usageLimitWaitSeconds`. When `run_task`
returns `Paused`, `run` SHALL append the start's events, the runner's
`paused` event last among them, and write `<change folder>/.run/paused.md`
as TypeScript's `writeUsagePause` does:
`---\ntask: "<task>"\nuntil: "<until>"\nsource: "<source>"\n---\n<body>\n`,
with the pause's task, until and source, and a body of the limit's error,
or `usage limit reached` without one. It SHALL write no `exited` event, no
dead marker and no done marker, run no audit and no verify, release the
task's lock, and fail with `task <task> of <folder> paused on a usage
limit`. A paused run writes no `retry` or `recertification` event, so the
next run of the task starts the same attempt.

#### Scenario: Paused on a usage limit
- **WHEN** a test runs `run` with the arguments `1`, `1` twice, one run after the other, on a copy of the run fixture made as "Run outcomes" says, except that `pi.bin` names a fake pi that prints the line `{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"429 Monthly usage limit reached"}}` and exits 1
- **THEN** each run fails with `run failed: task 1 of 001-a paused on a usage limit`; after each run the events after the last `started` event in `.run/events/1.jsonl` are exactly a `usage_limit` event with `error` `429 Monthly usage limit reached` and then a `paused` event with task `1`, source `wait`, that error and an `until` no earlier than rust-runners `pause_until` of a limit without a reset time, the time just before the run and 1800 seconds, and no later than the same for the time just after it; both `started` events have attempt 1; `.run/paused.md` equals `---\ntask: "1"\nuntil: "<until>"\nsource: "wait"\n---\n429 Monthly usage limit reached\n` with the last `paused` event's until, and rust-storage `read_usage_pause` reads that task, until, source and error from it; and `.run/dead/1.md`, `.run/done/1` and `.run/running/1.pid` do not exist

### Requirement: Worktree run
After it loads the config, `run` SHALL find the change as "Run refusals"
says when git is off, and with git on SHALL instead match the id, as
rust-approve "Approve lookup" matches it, against the active changes of
rust-storage `list_tree_changes` of rust-storage `change_trees` of the
root, with one candidate per entry of rust-vcs `worktree_list` of a
`GitVcs` at the root with the config's `timeouts`, and no stacked folders,
in that order. A git error fails with its display. Git is on when
`vcs.enabled` is true and rust-vcs `GitVcs::root`, run in the root, gives
a folder that is the root itself once both are canonicalized. The change
sits in the tree whose root its path starts with, and that tree's root is
the root every other run requirement names: the git check, the executor's
folder, the prompt, the scope audit's status, the verify runs and the
paths they write use it. With git off, and for a change in the root, `run`
behaves as the other run requirements say and makes no commit.

#### Scenario: Worktree run finds its tree
- **WHEN** a test builds a scratch git repository from the run fixture whose `osq.toml` turns git on with the author `Osq Bot <bot@example.com>`, adds the worktree `<scratch>/trees/001-a` on a new branch `osq/001-a` holding the change, approved there with its seal and committed, removes the change from the checkout, runs the fake pi in the `done` mode, and runs `run` with `1` and `1`
- **THEN** it gives the output `Task 1 of 001-a done\n`, the worktree holds `src/a.txt` and `openspec/changes/001-a/.run/done/1`, and the checkout holds neither

### Requirement: Verified task commit
When a task of a change in an osq worktree passes its verdict, `run`
SHALL, after "Done record", commit it in that worktree as TypeScript's
`commitWorktreeVerifiedTask` does, with a `GitVcs` at the tree's root with
the config's `timeouts`. The paths are, relative to the tree's root with
`/`, sorted and without repeats:

- each `path` and `from` of rust-vcs `status` that the scope audit counts
  as in the task's scope, its lock rules included;
- each untracked `path` that lies in a test folder the scope audit names
  for it;
- whichever of the change's `.run/done/<task>`, `.run/results/<task>.md`,
  `.run/events/<task>.jsonl` and `tasks.md` exist.

It commits them with rust-vcs `commit`, the author `vcs.author` and the
message rust-run "Task commit message" gives for the subject
`osq: <id> task <task> verified` and the outcome line
`[ok] task <task> verified (elapsed: <s>s)`. When the commit fails, `run`
SHALL leave the done marker and every other file as they are and fail
with `task <task> of <folder> is done, but osq could not commit it:
<error>`, `<error>` being the `VcsError`'s display.

#### Scenario: Verified task commit
- **WHEN** a test runs `run` as "Worktree run finds its tree" does
- **THEN** the tip of `osq/001-a` is the commit the run made, its message, with the elapsed seconds written `<s>`, is `osq: 001 task 1 verified\n\n<title>\n[ok] task 1 verified (elapsed: <s>s)\n\nOsq-Change: 001-a\nOsq-Task: 1\nOsq-Model: pi <model>\nOsq-Version: <version>\n`, where `<title>` is task 1's title and `<model>` and `<version>` are the `model` and `osqVersion` of the task's `started` event, and `git show --no-renames --name-status --format=` of it prints `A` for `openspec/changes/001-a/.run/done/1`, `openspec/changes/001-a/.run/events/1.jsonl`, `openspec/changes/001-a/.run/results/1.md` and `src/a.txt`, and `M` for `openspec/changes/001-a/tasks.md`, and nothing else

#### Scenario: Verified task commit fails
- **WHEN** a test runs `run` as "Worktree run finds its tree" does, with an executable `.git/hooks/pre-commit` in the repository that prints `refused by hook` and exits 1
- **THEN** it gives a `Failed` error for the command `run` whose message starts with `task 1 of 001-a is done, but osq could not commit it: ` and holds `refused by hook`, the worktree holds `openspec/changes/001-a/.run/done/1`, and the tip of `osq/001-a` is still the approval commit

### Requirement: Task commit message
A task commit's message SHALL be TypeScript's `formatCommitMessage` with
`readCommitTrailers`: the subject, an empty line, the task's title from
its task file, the outcome line, an empty line, `Osq-Change: <folder>`,
`Osq-Task: <task>`, then, when the task's `.run/events/<task>.jsonl` holds
a `started` event whose `data` has string `harness`, `model` and
`osqVersion` fields, `Osq-Model: <harness> <model>` and
`Osq-Version: <osqVersion>` from the last such event, each line followed
by a newline. Lines that are not JSON objects are passed over. `<id>` is
the folder's leading digits, or the whole folder name when it has none.
`<s>` is the whole seconds from the `timestamp` of the task's last
`started` event to now, never below 0, and 0 without one.

#### Scenario: Trailers from the last started event
- **WHEN** a test builds the repository "Worktree run finds its tree" builds, writes the worktree's `openspec/changes/001-a/.run/events/1.jsonl` holding `not json\n` and `{"type":"started","timestamp":"2020-01-01T00:00:00.000Z","data":{"harness":"old","model":"m0","osqVersion":"0.0.1"}}\n` before the run, runs the fake pi in the `done` mode, and runs `run` with `1` and `1`
- **THEN** the tip of `osq/001-a`'s message ends with `Osq-Model: pi <model>\nOsq-Version: <version>\n` from the run's own `started` event, not `old`, `m0` or `0.0.1`, and its outcome line's elapsed seconds are below 60

### Requirement: Dead task commit
When a task of a change in an osq worktree dies, `run` SHALL, after "Dead
record", record it in that worktree as TypeScript's `commitDeadTask` in
`src/core/run/dead-commit.ts` does, with a `GitVcs` at the tree's root
with the config's `timeouts`:

1. write the output of rust-vcs `patch(None)` to the change's
   `.run/dead/<task>.patch`, replacing any file there;
2. run rust-vcs `discard` with every `path` and `from` of `status` that
   neither equals nor lies under the change folder, relative to the tree's
   root with `/`, without repeats, in status order;
3. commit whichever of `.run/dead/<task>.md`, `.run/dead/<task>.patch` and
   `.run/events/<task>.jsonl` exist, with the author `vcs.author` and the
   message "Task commit message" gives for the subject `osq: <id> task
   <task> dead, reason <reason>` and the outcome line `[dead] task <task>
   dead (reason: <reason>, elapsed: <s>s)`.

When a step fails, `run` SHALL fail with `task <task> of <folder> died:
<reason>; osq could not commit it: <error>`, `<error>` being the error's
display, leaving the files as that step left them; otherwise it fails as
"Dead record" says.

#### Scenario: Dead task commit
- **WHEN** a test builds the repository "Worktree run finds its tree" builds, runs the fake pi in the `outside` mode, and runs `run` with `1` and `1`
- **THEN** it gives a `Failed` error for the command `run` with the message `task 1 of 001-a died: scope_violation`, the worktree no longer holds `src/a.txt` or `other.txt`, its `openspec/changes/001-a/.run/dead/1.patch` holds `+outside` and `+a`, the tip of `osq/001-a`'s message, with the elapsed seconds written `<s>`, starts with `osq: 001 task 1 dead, reason scope_violation\n\n<title>\n[dead] task 1 dead (reason: scope_violation, elapsed: <s>s)\n\nOsq-Change: 001-a\nOsq-Task: 1\n`, and `git show --no-renames --name-status --format=` of it prints `A` for `openspec/changes/001-a/.run/dead/1.md`, `openspec/changes/001-a/.run/dead/1.patch` and `openspec/changes/001-a/.run/events/1.jsonl` and nothing else

#### Scenario: Dead task commit fails
- **WHEN** a test runs the "Dead task commit" case with an executable `.git/hooks/pre-commit` in the repository that prints `refused by hook` and exits 1
- **THEN** it gives a `Failed` error for the command `run` whose message starts with `task 1 of 001-a died: scope_violation; osq could not commit it: ` and holds `refused by hook`, and the worktree holds `openspec/changes/001-a/.run/dead/1.md` and `openspec/changes/001-a/.run/dead/1.patch`

### Requirement: Paused worktree discard
When a task of a change in an osq worktree pauses on a usage limit, `run`
SHALL, after writing `.run/paused.md`, run rust-vcs `discard` in that
worktree with every `path` and `from` of `status` that neither equals nor
lies under the change folder, as TypeScript's
`discardPausedWorktreeChanges` does, and nothing when there is none. A
`VcsError` fails `run` with its display; otherwise it fails as "Run usage
pause" says. It commits nothing.

#### Scenario: Paused worktree discards outside files
- **WHEN** a test builds the repository "Worktree run finds its tree" builds and runs `run` with `1` and `1` with a fake pi that writes `src/a.txt` and then reports a usage limit
- **THEN** it gives a `Failed` error for the command `run` with the message `task 1 of 001-a paused on a usage limit`, the worktree holds `openspec/changes/001-a/.run/paused.md` but no `src/a.txt`, and the tip of `osq/001-a` is still the approval commit
