# rust-approve Specification

## Purpose
The approve feature: a human seals a change folder after its gates pass, and only approve, after the hash check, makes an approved change. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/approve/** -->
The rust-approve capability SHALL own the `osq-feature-approve` crate:
its manifest, its source, its tests and their fixtures.

#### Scenario: Approve crate ownership
- **WHEN** file ownership is resolved for the approve feature
- **THEN** system maps `crates/features/approve/**` to rust-approve

### Requirement: Approve feature
`osq-feature-approve` SHALL expose one public item, the unit struct
`ApproveFeature`, which implements rust-core's `Feature`, holds no storage
connection (ADR 028), and derives `Clone`, `Copy`, `Debug` and `Default`.
Its `name` SHALL be `approve`, and its `commands` SHALL be `approve` and then
`reject`, with the summaries and usages "Approve feature commands" gives.

#### Scenario: Approve feature commands
- **WHEN** a test reads `ApproveFeature`'s name and commands
- **THEN** the name is `approve`, and the commands are, in order, one with the name `approve`, the summary `lint, hash, and approve change folders` and the usage `<id> [--base-ok] [--ignore-dirty]`, and one with the name `reject`, the summary `move an eligible active change intact into rejected history` and the usage `<id> --reason <text>`

### Requirement: Approve arguments
`ApproveFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `approve` and `reject`. An
`approve` invocation's arguments `--base-ok` and `--ignore-dirty` are
flags, which may appear anywhere and more than once, and every other
argument is a change id. `approve` SHALL return
`FeatureError::usage("approve", "expected one change id, got <n>")` for an
invocation with `n` change ids when `n` is not 1, before it reads any
file. The flags change only what "Approval refusals with git on" refuses.
Every other failure of `approve` SHALL be `FeatureError::failed` with the
command `approve` and the message the other approve requirements name.

#### Scenario: Approve argument errors
- **WHEN** a test runs the invocation in the row with a root that holds no `openspec/` folder
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `approve` with no args | `Usage` error displayed `usage of approve: expected one change id, got 0` |
| `approve` with args `1`, `2` | `Usage` error displayed `usage of approve: expected one change id, got 2` |
| `queue` with args `1` | `UnknownCommand` error displayed `unknown command: queue` |
| `approve` with args `--base-ok`, `--ignore-dirty` | `Usage` error displayed `usage of approve: expected one change id, got 0` |
| `approve` with args `1`, `--base-ok`, `2` | `Usage` error displayed `usage of approve: expected one change id, got 2` |
| `approve` with args `--ignore-dirty`, `9`, `--base-ok`, `--base-ok` | `Failed` error displayed `approve failed: Spec "9" not found in <root>/openspec/changes` |

### Requirement: Approve lookup
`approve` SHALL approve the first active change folder whose name matches
the query: a folder matches when rust-core `parse_change_id` reads the
query with `slug` false into an id that names the folder, as rust-core
"Change ids" says, and a query it refuses matches no folder. With git off, as "Worktree approval" says, the folders are
rust-storage `list_changes` of the root, in its order. With git on, they are
the active entries of rust-storage `list_tree_changes` over `change_trees`
for the root, built from the `worktree_list` of a `GitVcs` at the root with
the config's `timeouts` and no stacked folders, in that order, so a change
approved into its osq worktree is found there, as TypeScript's
`findSteeringChange` finds it; a failing worktree listing SHALL fail with
the `VcsError`'s display. With no match, `approve` SHALL fail with
`Spec "<query>" not found in <changes>`, where `<query>` is the argument as
given and `<changes>` is the root joined with `openspec/changes`, shown with
`display()`. When `parse_change_id` refuses the query, `approve` and
`reject` SHALL instead fail, at the point they would refuse a query that
matches nothing, with the `ChangeIdError`'s display as the message. Archived and rejected folders never match, so unlike
TypeScript, an archived change that needs steering is not found.

#### Scenario: Approved folder for a query
- **WHEN** `approve` runs with the row's query on a root whose active change folders are `001-alpha`, `012-beta`, `012-beta-two` and `x-y`, and whose archived folder is `003-gamma`, each a valid change folder
- **THEN** it approves the row's folder, writing its `.run/approved`, and no other folder gains one, or it gives the row's `Failed` error, where `<changes>` is the root joined with `openspec/changes`:

| Query | Result |
|---|---|
| `1` | `001-alpha` |
| `001` | `001-alpha` |
| `  1  ` | `001-alpha` |
| `001-alpha` | `001-alpha` |
| `12` | `012-beta` |
| `012-beta-two` | `012-beta-two` |
| `x` | `Spec "x" not found in <changes>` |
| `x-y` | `x-y` |
| `3` | `Spec "3" not found in <changes>` |
| `alpha` | `Spec "alpha" not found in <changes>` |
| `012-beta-t` | `Spec "012-beta-t" not found in <changes>` |
| `1]` | `"1]" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |
| `0O1` | `"0O1" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |

#### Scenario: Reject refuses a query that is not a change id
- **WHEN** `reject` runs with the arguments `1]`, `--reason`, `why` on a root whose one active change folder `001-a` holds `proposal.md` and `tasks/1.md`
- **THEN** it gives a `Failed` error for the command `reject` with the message `"1]" is not a change id; give the change's number, such as 7 or 007, or its full folder name`, and leaves every file in place

### Requirement: Steering refusal
Before it validates or writes anything, `approve` SHALL read the change with
rust-storage `read_change`, failing with the `StorageError`'s display when
it cannot. An approved change, one whose snapshot is `approved`, has the
steering triggers TypeScript's `deriveSteering` in
`src/core/status/steering.ts` gives from the same marker facts, each a
target, a kind and a reason, shown as `<target> <kind> (<reason>)`, where
`<target>` is `change` or `task <n>`:

- The change's trigger comes from `change_regressed`: the reason
  `sync_conflict` gives the kind `conflict`, `requirement_changed` gives
  `requirement_changed`, and `verify_red`, `verify_path_missing` and
  `sync_verify_red` give `regression`; any other reason gives none.
- Then each task in task order: a regressed marker gives the kind
  `regression` with its reason, except one with the reason
  `scope_regression` whose `verification_passed` is true, which gives none;
  otherwise a done task gives none; otherwise a dead marker with the reason
  `blocked` or `entry_missing` gives `blocked`, one whose `stuck` is true
  gives `stuck`, and any other gives none.

An unapproved change has no steering trigger. The triggers `approve` acts on
are, for a change in an osq worktree, a tree whose `folder` is not none, its
steering triggers, or, with none, one trigger of the kind `dead` for each
task, in task order, that has a dead marker and no done or regressed marker,
with the dead marker's reason, as TypeScript's `humanSteering` gives them;
for a change in the root's own tree, its steering triggers. A trigger is a
default-branch trigger when its kind is `conflict` or `requirement_changed`,
or it is a `regression` with the reason `sync_verify_red`, as TypeScript's
`isDefaultBranchTrigger` says.

For a change with triggers, `approve` SHALL refuse, in this order and
writing nothing:

- a task whose `.run/running/<n>.pid` exists and that has no regressed, done
  or dead marker, with `<folder> has a task running; approve it after the task ends`,
  as TypeScript's `approveSteeredChange` refuses it; unlike TypeScript, Rust
  refuses it in the checkout too;
- a default-branch trigger, with
  `Change <folder> needs steering: <triggers>. Rust approve does not approve default-branch steering yet.`;
- with git on, a change in the root's own tree, with
  `Change <folder> needs steering: <triggers>. Rust approve steers a change with git on only in its worktree.`,

where `<triggers>` are every trigger shown, joined by `, `. Every other
change with triggers is approved as "Steered approval" says. A change in an
osq worktree with no triggers goes on to the checks the other approve
requirements name.

#### Scenario: Steering triggers
- **WHEN** `approve` runs with the query `1`, with git off, on a root whose one active change folder `001-a` is a valid change folder holding `tasks/1.md` and `tasks/2.md`, with the row's files under `.run/`, each marker's frontmatter written as the row gives it, calling the feature's `run`, so no event is delivered
- **THEN** it gives the row's `Failed` message and every file under `.run/` keeps its bytes; or, where the row says approved, it gives the `Output` `Approved 001 (001-a)\n  Hash: <seal>\n`, `.run/approved` holds the folder's seal and a newline, and no `.run/events/change.jsonl` is written; or, where the row says steered, it gives that `Output` followed by `  Continues from task <n>\n` for the row's task, `.run/approved` holds the seal and a newline, `.run/events/change.jsonl` holds one `approved` line whose `hash` is the seal and whose `targets` are the row's, and every other file under `.run/` keeps its bytes:

| Files under `.run/` | Result |
|---|---|
| `approved`, `regressed/change.md` with `reason: sync_conflict` | `Change 001-a needs steering: change conflict (sync_conflict). Rust approve does not approve default-branch steering yet.` |
| `approved`, `regressed/change.md` with `reason: requirement_changed` | `Change 001-a needs steering: change requirement_changed (requirement_changed). Rust approve does not approve default-branch steering yet.` |
| `approved`, `regressed/change.md` with `reason: sync_verify_red` | `Change 001-a needs steering: change regression (sync_verify_red). Rust approve does not approve default-branch steering yet.` |
| `approved`, `regressed/change.md` with `reason: verify_path_missing` | steered, targets `change`, task 1 |
| `approved`, `regressed/change.md` with `reason: worktree_dirty` | approved |
| `approved`, `regressed/1.md` with `reason: scope_regression` | steered, targets `1`, task 1 |
| `approved`, `regressed/1.md` with `reason: scope_regression` and `verification_passed: true` | approved |
| `approved`, `dead/1.md` with `reason: blocked` | steered, targets `1`, task 1 |
| `approved`, `dead/1.md` with `reason: entry_missing` | steered, targets `1`, task 1 |
| `approved`, `dead/1.md` with `reason: verify_red` and `stuck: true` | steered, targets `1`, task 1 |
| `approved`, `dead/1.md` with `reason: verify_red` | approved |
| `approved`, `done/1` and `dead/1.md` with `reason: blocked` | approved |
| `dead/1.md` with `reason: blocked`, no `approved` | approved |
| `approved`, `regressed/change.md` with `reason: verify_red`, `dead/2.md` with `reason: blocked` | steered, targets `change` and `2`, task 1 |
| `approved`, `done/1`, `regressed/change.md` with `reason: verify_red` | steered, targets `change`, task 2 |
| `approved`, `regressed/change.md` with `reason: verify_red`, `running/2.pid` holding `{"pid":999999,"startedAt":0}` | `001-a has a task running; approve it after the task ends` |
| `approved`, `regressed/change.md` with `reason: sync_conflict`, `running/1.pid` holding `{"pid":999999,"startedAt":0}` | `001-a has a task running; approve it after the task ends` |

### Requirement: Approve validation
After the steering check, `approve` SHALL validate the change with
rust-specs `validate_change`, with the change folder and the root joined
with `openspec/specs`, and, only when that gives no finding,
`validate_merged_change` with the same folders. With any finding, or a
`MergeChangeError` from the merged validation, `approve` SHALL fail with
`Lint failed for spec "<folder>":` followed, for each finding in order, by
a newline and `  - <file>:<line>: <message>`, or, for a merge error, by a
newline and `  - ` and the error's display, and SHALL write nothing. A
`SpecsError` from `validate_change` SHALL fail with its display. This is
TypeScript's lint refusal in `approveSpec` over the checks the specs kernel
runs; the rest of `osq lint`'s rules are not run.

#### Scenario: Validation refusals
- **WHEN** `approve` runs with the query `1` on a root whose living spec `openspec/specs/alpha/spec.md` is a copy of `tests/fixtures/approve-repo/openspec/specs/alpha/spec.md`, and whose one active change folder `001-a` holds a `proposal.md` and the row's delta
- **THEN** it gives a `Failed` error for the command `approve` with the row's message, written with `\n` escapes, where `<d>` is the root joined with `openspec/changes/001-a`, and `001-a` gains no `.run/approved`:

| Delta | Message |
|---|---|
| none | `Lint failed for spec "001-a":\n  - <d>/proposal.md:1: the change holds no delta spec` |
| `specs/alpha/spec.md` holding `## ADDED Requirements\n\n### Requirement: Alpha rests\nThe system rests alpha.\n\n#### Scenario: Alpha rests\n- **WHEN** alpha stops\n- **THEN** alpha rests\n` | ``Lint failed for spec "001-a":\n  - <d>/specs/alpha/spec.md:3: requirement `Alpha rests` states no SHALL or MUST`` |
| `specs/alpha/spec.md` holding `## MODIFIED Requirements\n\n### Requirement: Beta runs\nThe system SHALL run beta.\n\n#### Scenario: Beta runs\n- **WHEN** beta starts\n- **THEN** beta runs\n` | ``Lint failed for spec "001-a":\n  - <d>/specs/alpha/spec.md:3: the delta names `Beta runs`, which the living spec has no requirement for`` |
| `specs/alpha/spec.md` holding `## ADDED Requirements\n\n### Requirement: Alpha runs\nThe system SHALL run alpha.\n\n#### Scenario: A\n- **WHEN** a\n- **THEN** a\n` | `Lint failed for spec "001-a":\n  - <d>/specs/alpha/spec.md: alpha ADDED failed for header "### Requirement: Alpha runs" - already exists` |

### Requirement: Approval marker
When every check passes, `approve` SHALL write `<seal>` and a newline to the
change folder's `.run/approved`, creating `.run/` when it is missing, where
`<seal>` is the seal rust-storage `change_folder_seal` gives for the folder,
as TypeScript's `approveInPlace` and `writeApprovalSeal` write it. It SHALL
write the marker whether or not the change was approved before, as
TypeScript does, and SHALL leave every other file in the change folder as
it is. A `StorageError` from the seal SHALL fail with its display. It SHALL
then return as its output `Approved <id> (<folder>)`, a newline,
`  Hash: <seal>` and a newline, where `<id>` is the folder's leading
digits, or its whole name when it has none.

#### Scenario: Approval markers
- **WHEN** `approve` runs with the query `1` on a root whose one active change folder `001-a` is a valid change folder, with the row's files
- **THEN** it gives the output `Approved 001 (001-a)\n  Hash: <seal>\n`, written with `\n` escapes, its `.run/approved` holds `<seal>` and a newline, where `<seal>` is the seal `change_folder_seal` gives for `001-a` after the run, and every other row file keeps its bytes:

| Files |
|---|
| none, and no `.run/` folder |
| `.run/approved` holding `sha256:` and 64 `0`, `.run/done/1` and `.run/events/1.jsonl` holding one `started` event |
| `.run/approved` holding the folder's current seal and a newline |
| `plan-prompt.md` and `notes/why.md` |

#### Scenario: Output for a folder without a number
- **WHEN** `approve` runs with the query `x-y` on a root whose one active change folder `x-y` is a valid change folder
- **THEN** the output is `Approved x-y (x-y)\n  Hash: <seal>\n`, written with `\n` escapes, where `<seal>` is the seal `change_folder_seal` gives for `x-y`

### Requirement: TypeScript approval parity
The `.run/approved` marker `approve` writes SHALL equal, byte for byte, the
one TypeScript's `approveSpec` writes under `DEFAULT_CONFIG` for the same
change folder, whose lint passes.

#### Scenario: Golden approvals
- **WHEN** `approve` runs with the query `1` and then with the query `002-gamma` on a fresh scratch copy of `tests/fixtures/approve-repo`, whose change `001-alpha-twice` modifies a requirement of the living `alpha` spec and holds a root `plan-prompt.md`, and whose change `002-gamma` adds the capability `gamma`, holds `notes/why.md` and an older `.run/approved`
- **THEN** each run gives an `Output`, and each folder's `.run/approved` equals `tests/fixtures/approve-markers/<folder>.approved`, which TypeScript wrote for the same fixture, byte for byte:

| Folder | Marker |
|---|---|
| `001-alpha-twice` | `sha256:9aee5f041660ed83152089fd3d7880dd5fb428427af3e27e1aa995cd95b34ad1` |
| `002-gamma` | `sha256:49b75cb4fb4c7919d8d8cefc32d6741e12571819b450b5f5033840c8dce4f715` |

### Requirement: Reject arguments
Before it reads any file, `reject` SHALL read its arguments left to right:
`--reason` takes the next argument as the reason, and any other argument is
the change id. Without exactly one id and exactly one `--reason` with a
value, it fails with `FeatureError::usage("reject", "expected <id> --reason
<text>")`. A reason that is empty after trimming fails with
`FeatureError::usage("reject", "a non-empty rejection reason is required")`.

#### Scenario: Reject argument errors
- **WHEN** a test runs `reject` with the row's arguments on a root that holds no `openspec/` folder
- **THEN** it gives the row's `Usage` error, displayed as the row's text:

| Arguments | Text |
|---|---|
| none | `usage of reject: expected <id> --reason <text>` |
| `1` | `usage of reject: expected <id> --reason <text>` |
| `1`, `--reason` | `usage of reject: expected <id> --reason <text>` |
| `--reason`, `why` | `usage of reject: expected <id> --reason <text>` |
| `1`, `2`, `--reason`, `why` | `usage of reject: expected <id> --reason <text>` |
| `1`, `--reason`, `a`, `--reason`, `b` | `usage of reject: expected <id> --reason <text>` |
| `1`, `--reason`, `   ` | `usage of reject: a non-empty rejection reason is required` |

### Requirement: Reject refusals
`reject` SHALL find the change as "Approve lookup" does, then refuse, in
this order and writing nothing, with `FeatureError::failed("reject", ..)`
and TypeScript's `rejectSpec` texts: no match, a folder already under
`openspec/changes/rejected/`, any `.run/running/*.pid` file, and an approved
change that has not failed. Approved means `.run/approved` holds text that
is not blank. Failed means the "Reject eligibility" rule holds.

#### Scenario: Reject outcomes
- **WHEN** `reject` runs with the arguments `1`, `--reason`, `why` on a root whose one active change folder `001-a` holds `proposal.md`, `tasks/1.md` and `tasks/2.md` and the row's other files, every marker holding the text `x`
- **THEN** it gives the row's `Failed` message, displayed after `reject failed: `, and leaves every file in place, or, where the row says rejected, it moves the folder to `openspec/changes/rejected/001-a`:

| Other files | Result |
|---|---|
| none | rejected |
| `.run/approved` holding `sha` | `Change 001-a is approved and healthy; only a failed change may be rejected.` |
| `.run/approved` holding two spaces | rejected |
| `.run/approved` holding `sha`, `.run/dead/1.md` | rejected |
| `.run/approved` holding `sha`, `.run/dead/1.md`, `.run/done/1` | `Change 001-a is approved and healthy; only a failed change may be rejected.` |
| `.run/approved` holding `sha`, `.run/regressed/change.md` | rejected |
| `.run/approved` holding `sha`, `.run/regressed/2.md`, `.run/done/2` | rejected |
| `.run/approved` holding `sha`, `.run/dead/9.md` | `Change 001-a is approved and healthy; only a failed change may be rejected.` |
| `.run/running/1.pid`, `.run/dead/1.md` | `Change 001-a has a running task; rejection is refused.` |
| `.run/approved` holding `sha`, `.run/running/zz.pid`, `.run/regressed/change.md` | `Change 001-a has a running task; rejection is refused.` |
| the folder `openspec/changes/rejected/001-a` | `Cannot reject 001-a: destination "openspec/changes/rejected/001-a" already exists.` |

#### Scenario: Reject with no match
- **WHEN** `reject` runs with the arguments `7`, `--reason`, `why` on the "Reject outcomes" root with no other files
- **THEN** it fails with `Spec "7" not found in <changes>`, where `<changes>` is the root joined with `openspec/changes`, and writes nothing

### Requirement: Reject eligibility
An approved change SHALL count as failed, as TypeScript's `deriveSpecState`
gives `dead` or `regressed`, when `.run/regressed/change.md` exists, or when
some task file `tasks/<n>.md` has `.run/regressed/<n>.md`, or has
`.run/dead/<n>.md` and no `.run/done/<n>`. `reject` reads these marker files
directly, never the event streams, and ignores markers whose task has no
task file.

#### Scenario: Eligibility from markers
- **WHEN** `reject` runs on the "Reject outcomes" rows whose `.run/approved` holds `sha`
- **THEN** it rejects exactly the rows whose markers name `change` or a task with a task file and no done marker for its dead marker, as the table gives

### Requirement: Rejection record
`reject` SHALL create `openspec/changes/rejected/`, rename the folder into
it, write `.run/rejected.md` as `---\nreason: <r>\ntimestamp: <t>\n---\n`,
and append `{"type":"rejected","timestamp":<t>,"data":{"reason":<r>}}` and
`\n` to `.run/events/change.jsonl`. `<r>` is the trimmed reason and `<t>`
the UTC time as `YYYY-MM-DDTHH:MM:SS.mmmZ`, each as a JSON string. It prints
`Rejected <id> (<folder>)`, `  Reason: <reason>` and `  Destination: <path>`.

#### Scenario: Rejection files
- **WHEN** `reject` runs with the arguments `--reason`, `  why "x"  `, `1` on the "Reject outcomes" root with no other files, and the test reads the clock before and after
- **THEN** `openspec/changes/001-a` is gone, `openspec/changes/rejected/001-a` holds `proposal.md` and both task files with their bytes, its `.run/rejected.md` is `---\nreason: "why \"x\""\ntimestamp: "<t>"\n---\n`, its `.run/events/change.jsonl` is the one line `{"type":"rejected","timestamp":"<t>","data":{"reason":"why \"x\""}}` and `\n`, and the output is `Rejected 001 (001-a)\n  Reason: why "x"\n  Destination: <root>/openspec/changes/rejected/001-a\n`, where `<t>` is one UTC time between the two clock readings, written to the millisecond

### Requirement: Worktree approval
`approve` SHALL read `osq.toml` with rust-config `load_config` after it
checks its arguments and before it reads any change, failing with the
`ConfigError`'s display when it cannot. Right after it, `approve` SHALL
call rust-vcs `project_git_root` on the root and fail with the `NestedRoot`'s
display when it gives one, as rust-vcs "Project root check" says. Git is on
when `project_git_root` gives a folder. With git on, once every check the other approve
requirements name has passed, and when "Stacked approval" finds nothing the
change waits for, `approve` SHALL approve the change into its
own branch and worktree as TypeScript's `approveIntoNewWorktree` in
`src/core/spec/approve-worktree.ts` does, instead of writing the
checkout's marker as "Approval marker" says. With git off, including when
git cannot start, it SHALL approve in the checkout as "Approval marker"
says, as TypeScript does when `selectVcs` gives no git.

Here `<seal>` is the seal rust-storage `change_folder_seal` gives for the
checkout's change folder; `<repo>` is the folder `project_git_root` gives;
`<worktree>` is the parent of rust-vcs `stacked_root` for `vcs`, `<repo>`
and the `HOME` variable, empty when unset, joined with `<folder>`;
`<branch>` is `osq/<folder>`; `<base>` is HEAD's commit from rust-vcs
`head`; and "record `<op>` for `<path>`" means rust-vcs
`append_tree_record` to the path rust-vcs `tree_record_path` gives for the
root, read once before the first write, with the time now as
`YYYY-MM-DDTHH:MM:SS.mmmZ` in UTC, `<op>` and `<path>`, and nothing when
that path is none, as TypeScript's `RecordingGitVcs` records. With git on,
`approve` SHALL, in this order:

1. create `<worktree>`'s parent folders, create `<branch>` at `<base>`, or
   at `HEAD` when HEAD has no commit, add the worktree `<worktree>` for
   `<branch>`, and record `worktree-add` for the root, as the invocation
   gives it;
2. when `vcs.prepare` is set, run it in `<worktree>` with rust-harnesses
   `run_verify`, with the process's variables as its source, no configured
   or agent names, no change, diff or extra variables, the config's
   `timeouts.verify_timeout` as its timeout and its
   `timeouts.harness_kill_grace` as its grace. On an exit other than 0, or
   a `ProcessError`, it SHALL roll back and then fail with
   `prepare failed in worktree <worktree> on branch <branch>:`, a newline
   and the output or the error's display, as TypeScript's `runPrepare`
   words it. Unlike TypeScript, which leaves the branch and worktree in
   place, the rollback removes the folder `<worktree>`, runs rust-vcs
   `worktree_prune` in the root, records `worktree-prune` for the root, and
   deletes `<branch>` with rust-vcs `delete_branch`, so a second `approve`
   needs no cleanup. The branch then still points at `<base>` and holds no
   commit of its own, because the approval commit comes after prepare, and
   `delete_branch` refuses any branch HEAD does not hold (ADR 003). When a
   rollback step fails, the rollback stops and the message gains a newline
   and `rollback failed: ` with that error's display;
3. replace `<worktree>/openspec/changes/<folder>` with a copy of the
   checkout's change folder, `.run/` included;
4. write `<seal>` and a newline to the copy's `.run/approved`, `<base>`,
   empty without one, and a newline to `.run/base`, and `<name> <<email>>`
   and a newline to `.run/approver`, where `<name>` and `<email>` are
   rust-vcs `config_value` of `user.name` and `user.email` in the root,
   each empty when unset;
5. commit `openspec/changes/<folder>` with a `GitVcs` in `<worktree>`, the
   message `osq: <id> approved` and the author `vcs.author`, and record
   `commit` for `<worktree>`;
6. remove the folder `<folder>` under rust-vcs `stacked_root` when it
   exists;
7. remove the checkout's change folder, unless rust-vcs `path_exists` says
   `HEAD` holds `openspec/changes/<folder>`.

A `VcsError` or a file error SHALL fail with its display. `approve` SHALL
then return as its output `Approved <id> (<folder>)`, `  Hash: <seal>`,
the line "Rejected branch claim" adds when it renamed a branch,
`  Worktree: <worktree>` and `  Branch: <branch>`, each followed by a
newline, where `<id>` is as "Approval marker" says. Unlike TypeScript, it
writes no `.run/manifest.json` and no `.run/plan.jsonl`, prints no digest
lines, and runs prepare with the verify role's environment.

#### Scenario: Worktree approvals equal TypeScript's
- **WHEN** `approve` runs with the row's query on a scratch git repository `<root>/repo` built as `golden/print-goldens.mjs.txt` builds it: a copy of `tests/fixtures/approve-repo` on the branch `main`, whose one commit holds every file but the folder `openspec/changes/001-alpha-twice`, with the git settings `user.name` `Osq Tester` and `user.email` `tester@example.com`, and an `osq.toml` that git ignores, whose `[vcs]` table sets `enabled = true`, `author = "Osq Bot <bot@example.com>"`, `worktreeRoot` to `<root>/worktrees` and the row's settings
- **THEN** its outcome, its approval lines or its message, the `osq/` branches, the osq worktrees, whether the checkout's copy exists, the approval commit, the lines of `<root>/repo/.git/osq-trees.jsonl` with each `at` written as `<at>`, and the worktree copy's `.run/` files, written as the script writes them, equal `tests/fixtures/approve-worktree/<golden>`, which TypeScript's built `dist` printed for the same repository:

| Golden | Query | Settings |
|---|---|---|
| `draft-001.txt` | `1` | none |
| `committed-002.txt` | `2` | none |
| `prepare-passes-001.txt` | `1` | `prepare = "echo prepared > prepared.txt"` |

#### Scenario: Prepare failure rolls back
- **WHEN** `approve` runs with the query `1` on a repository built as "Worktree approvals equal TypeScript's" builds it with the setting `prepare = "echo prepare said no; exit 3"`, and then, after `osq.toml`'s `prepare` is changed to `echo prepared > prepared.txt`, runs with the query `1` again
- **THEN** the first run gives a `Failed` error whose message, trailing whitespace dropped, is the message of `tests/fixtures/approve-worktree/prepare-fails-001.txt`, `prepare failed in worktree <root>/worktrees/repo/001-alpha-twice on branch osq/001-alpha-twice:\nprepare said no`, written with `\n` escapes; after it there is no `osq/` branch, no osq worktree and no folder `<root>/worktrees/repo/001-alpha-twice`, the checkout's copy exists, and the tree record's lines are `{"at":"<at>","op":"worktree-add","root":"<root>/repo"}` and `{"at":"<at>","op":"worktree-prune","root":"<root>/repo"}`, where TypeScript's golden keeps the branch and the worktree; the second run gives an `Output`, and its golden text equals `prepare-passes-001.txt` except that its record section starts with those two lines

#### Scenario: Git off approves in the checkout
- **WHEN** `approve` runs with the query `1` on a scratch copy of `tests/fixtures/approve-repo` under `CARGO_TARGET_TMPDIR`, which sits inside this repository's git work tree but is not its top level, with an `osq.toml` whose `[vcs]` table sets `enabled = false` and `author = "Osq Bot <bot@example.com>"`
- **THEN** it gives the output `Approved 001 (001-alpha-twice)\n  Hash: sha256:9aee5f041660ed83152089fd3d7880dd5fb428427af3e27e1aa995cd95b34ad1\n`, written with `\n` escapes, and the copy's `openspec/changes/001-alpha-twice/.run/approved` holds that seal and a newline

#### Scenario: Stacked copy removed
- **WHEN** `approve` runs with the query `1` on the repository of the row `draft-001.txt` of "Worktree approvals equal TypeScript's", which also holds the file `<root>/worktrees/repo/.stacked/001-alpha-twice/note.txt`
- **THEN** it gives an `Output`, and the folder `<root>/worktrees/repo/.stacked/001-alpha-twice` no longer exists

#### Scenario: Unreadable config
- **WHEN** `approve` runs with the query `1` on a scratch copy of `tests/fixtures/approve-repo` whose `osq.toml` holds a `[vcs]` table with `enabled = "yes"`
- **THEN** it gives a `Failed` error displayed `approve failed: vcs.enabled must be a boolean`, and the copy's `openspec/changes/001-alpha-twice/.run/` does not exist

### Requirement: Approval refusals with git on
With git on, as "Worktree approval" says, once every check the other
approve requirements name has passed and before any write, `approve` SHALL
refuse, in this order, as TypeScript's `approveIntoWorktree` does:

- unless `--base-ok` was given, HEAD on a branch other than the default
  branch, with `HEAD is on <branch>, not the default branch <default>; pass --base-ok to approve from it`,
  where `<branch>` is the branch rust-vcs `head` gives, or `a detached HEAD`
  when it gives none, and `<default>` is rust-vcs `default_branch` with
  `vcs.defaultBranch`, or `main` when it is unset, as its fallback;
- unless `--ignore-dirty` was given, rust-vcs `status` entries whose path,
  or whose old path, the `scope` of some task of the change covers, by
  rust-core `scope_covers_path`, with
  `uncommitted changes in task scope: <paths>; <advice>`, where `<paths>`
  are those paths, sorted, each once, joined by `, `, and `<advice>` is
  `keep them with osq manual "<why>", commit them, or pass --ignore-dirty`,
  or `commit them or pass --ignore-dirty` when `vcs.manualEdits` is
  `block`;
- an existing `osq/<folder>` branch, by rust-vcs `list_branches`, whose
  tip lacks `openspec/changes/rejected/<folder>/.run/rejected.md` or that a
  worktree from rust-vcs `worktree_list` has checked out, with
  `branch osq/<folder> already exists`.

A refusal SHALL leave every branch, worktree and file as it was.

#### Scenario: Worktree refusals equal TypeScript's
- **WHEN** `approve` runs with the row's arguments on a repository built as "Worktree approvals equal TypeScript's" builds it, with no settings except the row's, after the row's setup
- **THEN** its outcome, its approval lines or its message, the `osq/` branches, the osq worktrees, whether the checkout's copy exists, the approval commit and the worktree copy's `.run/` files equal `tests/fixtures/approve-worktree/<golden>`:

| Golden | Arguments | Setup |
|---|---|---|
| `off-default-001.txt` | `1` | HEAD on a new branch `feature` at `main` |
| `base-ok-001.txt` | `1`, `--base-ok` | HEAD on a new branch `feature` at `main` |
| `dirty-keep-001.txt` | `1` | `src/alpha/index.js` holds `module.exports = { runs: 3 };` and a newline, not committed |
| `dirty-block-001.txt` | `1` | as `dirty-keep-001.txt`, with the setting `manualEdits = "block"` |
| `ignore-dirty-001.txt` | `1`, `--ignore-dirty` | as `dirty-keep-001.txt` |
| `branch-exists-001.txt` | `1` | a branch `osq/001-alpha-twice` at `main` |
| `rejected-branch-001.txt` | `1` | a branch `osq/001-alpha-twice` whose one commit past `main` adds `openspec/changes/rejected/001-alpha-twice/.run/rejected.md` |

#### Scenario: More refusals with git on
- **WHEN** `approve` runs with the query `1` on a repository built as "Worktree approvals equal TypeScript's" builds it, with the row's settings, after the row's setup
- **THEN** it gives a `Failed` error displayed `approve failed: ` and the row's message, and the `osq/` branches, the osq worktrees and the checkout's copy are as they were before the run:

| Setup | Settings | Message |
|---|---|---|
| HEAD detached at `main`'s commit | none | `HEAD is on a detached HEAD, not the default branch main; pass --base-ok to approve from it` |
| none | `defaultBranch = "trunk"` | `HEAD is on main, not the default branch trunk; pass --base-ok to approve from it` |
| `src/alpha/index.js` renamed to `src/alpha/moved.js` with `git mv` | none | `uncommitted changes in task scope: src/alpha/index.js; keep them with osq manual "<why>", commit them, or pass --ignore-dirty` |
| the branch of `rejected-branch-001.txt`, checked out in a worktree at `<root>/other` | none | `branch osq/001-alpha-twice already exists` |

### Requirement: Rejected branch claim
When `osq/<folder>` exists, its tip holds
`openspec/changes/rejected/<folder>/.run/rejected.md`, and no worktree has
it checked out, `approve` SHALL, once every refusal has passed and before
any other write, rename it with rust-vcs `rename_branch` to
`osq/<folder>-rejected-<n>`, with the lowest `<n>` from 1 that no branch
rust-vcs `list_branches` gives for the prefix `osq/<folder>-rejected-`
has, as TypeScript's `claimBranch` in `src/core/spec/approve-branch.ts`
does. As in TypeScript, it renames the branch before "Stacked approval"
decides whether the change stacks, so a stacked approval renames it too.
Its output, worktree or stacked, SHALL then hold
`  Kept rejected branch: <kept>` and a newline right after the hash line,
where `<kept>` is the new name.

#### Scenario: Kept branch name skips a taken one
- **WHEN** `approve` runs with the query `1` on the repository of the row `rejected-branch-001.txt` of "Worktree refusals equal TypeScript's", which also holds a branch `osq/001-alpha-twice-rejected-1` at `main`
- **THEN** its output's third line is `  Kept rejected branch: osq/001-alpha-twice-rejected-2`, and the `osq/` branches are `osq/001-alpha-twice`, `osq/001-alpha-twice-rejected-1` and `osq/001-alpha-twice-rejected-2`

### Requirement: Worktree rejection
After it checks its arguments and before it reads any change, `reject`
SHALL read `osq.toml` with rust-config `load_config`, failing with the
`ConfigError`'s display when it cannot. Git is on as "Worktree approval"
says. With git off, `reject` SHALL find and reject the change as the other
reject requirements say. With git on, it SHALL instead match the query, as
"Approve lookup" matches it, against the active changes of rust-storage
`list_tree_changes` of rust-storage `change_trees` of the root, with one
candidate per entry of rust-vcs `worktree_list` of a `GitVcs` at the root
with the config's `timeouts`, and no stacked folders, in that order. A git
error fails with its display. The change sits in the tree whose root its
path starts with, and that tree's root is the root every other reject
requirement names: the destination, its refusal text, the move and the
record use it.

When the change sits in an osq worktree, `reject` SHALL, after the record
is written, finish the rejection as TypeScript's `commitRejectedWorktree`
in `src/core/lifecycle/reject-vcs.ts` does, with a `GitVcs` at the tree's
root with the config's `timeouts`. `<tree>` is the folder that `GitVcs`'s
rust-vcs `root` gives, or the tree's root when it gives none.

1. It takes every `path` and every `from` of rust-vcs `status` that equals,
   or lies under, the change folder's old path or its rejected path, each
   relative to `<tree>` with `/`, sorted and without repeats, and commits
   them with rust-vcs `commit`, the author `vcs.author` and the message
   made of these lines, each followed by a newline: `osq: <id> rejected`,
   an empty line, the trimmed reason, `rejected to <rejected path>`, an
   empty line and `Osq-Change: <folder>`, `<rejected path>` relative to
   `<tree>` with `/`.
2. When `status` again lists a `path` or `from` outside those two folders,
   it keeps the worktree because `the worktree has other changes`.
3. Otherwise it removes the worktree with rust-vcs `worktree_remove` of
   `<tree>`.

A `VcsError` at any step keeps the worktree, and its display is the
reason. Unlike TypeScript, which throws when the second `status` fails,
Rust keeps the worktree with that error's display too. The branch
`osq/<folder>` is always kept.

The output of a worktree rejection SHALL be `Rejected <id> (<folder>)`,
`  Reason: <reason>`, then `  Worktree removed: <tree>`, or
`  Worktree kept: <tree> (<why>)` with the reason it was kept, then
`  Branch kept: osq/<folder>`, each followed by a newline. A change in the
root, with git on or off, is rejected with no git call after the lookup,
and its output stays as "Rejection record" says.

#### Scenario: Worktree rejections equal TypeScript's
- **WHEN** a test builds the scratch repository `openspec/changes/300-rust-reject-worktree/golden/print-reject-worktree-goldens.mjs.txt` describes for the row's case, from `tests/fixtures/reject-worktree`, a copy of `openspec/changes/300-rust-reject-worktree/fixture/reject-worktree/`, and runs `reject` with the row's id, `--reason` and `why` on `<scratch>/repo`
- **THEN** its `out:` lines, its `error:` message displayed after `reject failed: `, and its `branches:`, `worktrees:`, `tip:`, `commit:` and `status:` lines, built as the script builds them with the scratch folder written `<scratch>`, equal the row's golden in `tests/fixtures/reject-worktree-golden/`, a copy of `openspec/changes/300-rust-reject-worktree/golden/`, except that a `Worktree kept:` line whose row gives a phrase starts with `  Worktree kept: <scratch>/trees/001-alpha (` and holds the phrase, and the golden's line or lines for that why are not compared:

| Case | Id | Golden | Phrase |
|---|---|---|---|
| `removed` | `1` | `removed-001.txt` | none |
| `other-changes` | `1` | `other-changes-001.txt` | none |
| `hook-fails` | `1` | `hook-fails-001.txt` | `refused by hook` |
| `locked` | `1` | `locked-001.txt` | `cannot remove a locked working tree` |
| `healthy` | `2` | `healthy-002.txt` | none |
| `root` | `3` | `root-003.txt` | none |

#### Scenario: Reject config that does not load
- **WHEN** a test runs `reject` with the arguments `1`, `--reason`, `why` on the "Reject outcomes" root with no other files, whose `osq.toml` holds `[vcs]` and `enabled = true`, each followed by a newline
- **THEN** it gives a `Failed` error displayed `reject failed: ` followed by the display of the error rust-config `load_config` gives for that root, and `openspec/changes/001-a` is still in place with no `.run/` folder

### Requirement: Steered approval
`approve` SHALL approve a change with triggers that "Steering refusal" does
not refuse as TypeScript's `approveSteeredChange` in
`src/core/spec/approve-steer.ts` approves one in its worktree, and as its
`approveSpec` in `src/core/spec/approve.ts` approves one in place with git
off, keeping every done task. After "Approve validation" passes, which
validates the change's folder against the root's living specs, and with
`<seal>` the seal rust-storage `change_folder_seal` gives for that folder,
`approve` SHALL, in this order:

1. for a change in an osq worktree, fail with
   `vcs.author is required when vcs.enabled is true` when `vcs.author` is
   unset;
2. write `<seal>` and a newline to the folder's `.run/approved`;
3. append to the folder's `.run/events/change.jsonl`, creating the folders
   it needs, one rust-core `approved` event line with the time now as
   `YYYY-MM-DDTHH:MM:SS.mmmZ` in UTC, the `hash` `<seal>`, and the `targets`
   of its triggers, in order, each `change` or the task's id;
4. for a change in an osq worktree, commit `openspec/changes/<folder>` with
   a `GitVcs` at the worktree's root with the config's `timeouts`, the
   message `osq: <id> approved` and the author `vcs.author`, and record
   `commit` for the worktree's root as "Worktree approval" records it. When
   the commit fails and rust-vcs `show` of HEAD's
   `openspec/changes/<folder>/.run/approved`, trimmed, is not `<seal>`,
   `approve` SHALL put `.run/approved` and `.run/events/change.jsonl` back
   as they were, removing one that was absent, record nothing, and fail with
   `the approved commit failed in <worktree>: <error>. The approval seal is undone and the plan edits are kept; run osq approve <id> again.`,
   where `<worktree>` is the worktree's root and `<error>` the `VcsError`'s
   display.

`<id>` is as "Approval marker" says. A steered approval makes no branch or
worktree, removes no folder, and writes no other file. Unlike TypeScript, it
writes no `.run/manifest.json` and no `.run/plan.jsonl`, and the approval
commit always holds the new `approved` line, so running `approve` again after
a failed commit never finds nothing to commit. `approve` SHALL then return
as its output `Approved <id> (<folder>)`, `  Hash: <seal>`, for a change in
an osq worktree `  Worktree: <worktree>` and `  Branch: osq/<folder>`, and
`  Continues from task <n>`, where `<n>` is the first task, in task order,
that has no done marker or has a regressed marker, left out when there is
none, each followed by a newline. `approve` retires no trigger itself:
rust-retry "Approval reaction" does, when the command's events are
delivered (ADR 030).

#### Scenario: Steered worktree approvals
- **WHEN** `approve` runs with the query `1`, calling the feature's `run` so no event is delivered, on a scratch repository built as `golden/print-steered-goldens.mjs.txt` builds the row's case, with an `osq.toml` that git ignores, whose `[vcs]` table sets `enabled = true`, `author = "Osq Bot <bot@example.com>"` and `worktreeRoot` to `<root>/worktrees`
- **THEN** it gives an `Output` whose text equals the golden `tests/fixtures/steered-golden/<case>.txt`'s approval lines, each followed by a newline, with `<root>` the scratch root; the tip of `osq/001-alpha-twice` has the golden's commit lines, its changed files left out as the script leaves them out; the tree record's lines equal the golden's; `.run/approved` holds the golden's seal and a newline; `.run/events/change.jsonl` ends with one `approved` line whose `hash` is that seal and whose `targets` are the row's; and every marker the case wrote keeps its bytes:

| Case | Targets |
|---|---|
| `dead-001` | `1` |
| `blocked-001` | `1` |
| `change-001` | `change` |

#### Scenario: Steered worktree refusals
- **WHEN** `approve` runs with the query `1` on a repository built as "Steered worktree approvals" builds it for the row's case
- **THEN** it gives a `Failed` error displayed `approve failed: ` and the row's message, every `osq/` branch points where it pointed before the run, the tree record gains no line, and every file under the change folder's `.run/` is as before the run:

| Case | Message |
|---|---|
| `running-001` | the message of `tests/fixtures/steered-golden/running-001.txt` |
| `commit-fails-001` | `the approved commit failed in <root>/worktrees/repo/001-alpha-twice: <error>. The approval seal is undone and the plan edits are kept; run osq approve 001 again.`, the golden's text with `<error>` in place of git's message |
| `blocked-001` with `.run/regressed/change.md` holding `reason: sync_conflict` instead of its dead marker | `Change 001-alpha-twice needs steering: change conflict (sync_conflict). Rust approve does not approve default-branch steering yet.` |
| `blocked-001` with its markers written in the checkout's folder, which is not moved, and no worktree | `Change 001-alpha-twice needs steering: task 1 blocked (blocked). Rust approve steers a change with git on only in its worktree.` |
| `blocked-001` with no `author` in `osq.toml` | `vcs.author is required when vcs.enabled is true` |

### Requirement: Stacked approval
With git on, as "Worktree approval" says, once the refusals "Approval
refusals with git on" names have passed and "Rejected branch claim" has
renamed any rejected branch, `approve` SHALL work out what the change waits
for as TypeScript's `awaitedForApproval` in `src/core/spec/stack-overlap.ts`
does. When that is not empty, it SHALL record a stacked approval as
TypeScript's `recordStackedApproval` in `src/core/spec/stack-dependencies.ts`
does, in place of the branch and worktree "Worktree approval" makes.

The reads:

- The changes are rust-storage `list_tree_changes` of `change_trees` for
  the root, the worktrees rust-vcs `worktree_list` gives, and the folders
  directly under rust-vcs `stacked_root`. A folder's path is the path of
  the first of these changes with that folder name. A `depends_on` entry
  names the first change whose folder matches it as "Approve lookup"
  matches a query. An entry that names none is left out.
- A change's delta capabilities are the names of the folders directly
  under its `specs/`.
- A folder `<f>` reads, as TypeScript's `readDependencyState` gives it,
  with its hash:
  - landed when the default branch, read as "Approval refusals with git
    on" reads it, holds `openspec/changes/archive/<f>`;
  - otherwise, when the branch `osq/<f>` exists: archived when it holds
    `openspec/changes/archive/<f>/.run/approved`, approved when it holds
    `openspec/changes/<f>/.run/approved`, and unapproved otherwise, with
    that marker's text from rust-vcs `show`, trimmed, as its hash;
  - otherwise approved, with the first of these files that exists, trimmed,
    as its hash: `<f>/openspec/changes/<f>/.run/approved` under
    `stacked_root`, then the root's `openspec/changes/<f>/.run/approved`,
    then its `openspec/changes/archive/<f>/.run/approved`;
  - otherwise unapproved.
  A folder is awaited when it reads approved or archived.
- A `.run/stacked-on` line, split on whitespace, is an overlap line when
  it has a folder, a hash, the word `overlap` and a fourth word. Its
  capabilities are that word's `,`-separated parts, empty ones left out.
  Every other line is passed over.
- The awaited entries of a change folder at `<p>` are, in order:
  - each `depends_on` entry of `<p>/proposal.md` that names an awaited
    folder not named yet, as a declared entry with that folder's hash;
  - then each overlap line of `<p>/.run/stacked-on` whose folder no
    earlier entry names and is awaited, as an overlap entry with the
    line's hash and capabilities.
- The overlaps are each other awaited change folder, once per name, that
  shares a delta capability with the change, as an overlap entry with its
  hash and the shared capabilities, sorted. The overlaps are sorted by
  folder name. A change with no delta capability has none.
- The closure of a folder `<f>` is every folder reached by following
  awaited entries from `<f>`'s path, then from each folder reached, leaving
  out `<f>`. A folder with no path adds nothing.
- What the change waits for is the awaited entries of the checkout's change
  folder. After them come each of the overlaps that no earlier entry names
  and that no closure of another endpoint holds, where the endpoints are the
  folders of those entries and of the overlaps, each once.

With `<stacked>` the folder `<folder>` under `stacked_root` for `vcs`, the
folder `project_git_root` gives and the `HOME` variable, empty when unset,
and `<seal>` as "Worktree approval" says, a stacked approval SHALL, in this
order:

1. remove `<stacked>` when it exists;
2. copy the checkout's change folder, `.run/` included, to
   `<stacked>/openspec/changes/<folder>`;
3. write `<seal>` and a newline to the copy's `.run/approved`, creating
   `.run/` when needed, and `.run/approver` as "Worktree approval" writes
   it;
4. write the copy's `.run/stacked-on`: one line per entry of what the
   change waits for, in order, `<folder> <hash>` for a declared entry and
   `<folder> <hash> overlap <capabilities>` for an overlap entry, with the
   capabilities joined by `,`, the lines joined by a newline, with none
   after the last;
5. remove the checkout's change folder, unless rust-vcs `path_exists` says
   `HEAD` holds `openspec/changes/<folder>`.

A stacked approval makes no branch, worktree or commit, adds no line to the
tree record, and writes no `.run/base` and no event. A `VcsError` or a file
error SHALL fail with its display. `approve` SHALL then return as its output
`Approved <id> (<folder>)`, `  Hash: <seal>`, the line "Rejected branch
claim" adds when it renamed a branch, `  Waiting for: <folders>` with the
folders of what the change waits for joined by `, `, one
`  Runs after <f>, which also writes <capabilities>` per overlap entry, in
order, with its capabilities joined by `, `, and `  Stacked: <stacked>`,
each followed by a newline. As in "Worktree approval", it writes no
`.run/manifest.json` and no `.run/plan.jsonl` and prints no digest lines.

#### Scenario: Stacked approvals equal TypeScript's
- **WHEN** `approve` runs with each query of the row's steps in turn on a repository built as "Worktree approvals equal TypeScript's" builds it, with no settings, after the row's setup, where `003-alpha-thrice` and `004-alpha-four` are uncommitted copies of the folder `001-alpha-twice` under those names, made before the first run
- **THEN** the last run's outcome and approval lines, the `osq/` branches, the osq worktrees, whether the queried folder's checkout copy exists, the lines of `<root>/repo/.git/osq-trees.jsonl` with each `at` written as `<at>`, every file under `<root>/worktrees/repo/.stacked/<folder>` and the stacked copy's `.run/` files, written as `golden/print-stacked-goldens.mjs.txt` writes them, equal `tests/fixtures/stacked-golden/<golden>`, which TypeScript's built `dist` printed for the same repository:

| Golden | Steps | Setup |
|---|---|---|
| `overlap-003.txt` | `1`, `3` | `003-alpha-thrice` exists |
| `chain-004.txt` | `1`, `3`, `4` | `003-alpha-thrice` and `004-alpha-four` exist |
| `declared-002.txt` | `1`, `2` | `002-gamma`'s proposal says `depends_on: ["001"]` |
| `kept-003.txt` | `1`, `3` | `003-alpha-thrice` exists; a branch `osq/003-alpha-thrice` whose one commit past `main` adds `openspec/changes/rejected/003-alpha-thrice/.run/rejected.md` |

#### Scenario: What a stacked approval waits for
- **WHEN** `approve` runs with the row's query on a repository built as "Worktree approvals equal TypeScript's" builds it, with no settings, after the row's setup, where `003-alpha-thrice` is a copy of the folder `001-alpha-twice` under that name, not committed, `<seal>` is `sha256:9aee5f041660ed83152089fd3d7880dd5fb428427af3e27e1aa995cd95b34ad1`, and "sealed" is a `.run/approved` holding `sealed` and a newline
- **THEN** it gives an `Output`, and `<root>/worktrees/repo/.stacked/<folder>/openspec/changes/<folder>/.run/stacked-on` for the queried folder holds the row's lines, joined by a newline with none after the last, or, where the row says not stacked, it creates the branch `osq/<folder>` and no folder `<root>/worktrees/repo/.stacked/<folder>`:

| Setup | Query | Result |
|---|---|---|
| `approve` ran with `1`; `002-gamma`'s proposal says `depends_on: ["001"]` | `2` | `001-alpha-twice <seal>` |
| `002-gamma`'s proposal says `depends_on: ["001"]` | `2` | not stacked |
| `003-alpha-thrice` exists and `approve` ran with `3` | `1` | `003-alpha-thrice <seal> overlap alpha` |
| `approve` ran with `2` | `1` | not stacked |
| `<root>/worktrees/repo/.stacked/003-alpha-thrice/openspec/changes/003-alpha-thrice` is a copy of `001-alpha-twice` that is sealed | `1` | `003-alpha-thrice sealed overlap alpha` |
| `002-gamma`'s proposal says `depends_on: ["001"]`; a branch `osq/001-alpha-twice` whose one commit past `main` adds `openspec/changes/archive/001-alpha-twice/.run/approved`, sealed | `2` | `001-alpha-twice sealed` |
| `003-alpha-thrice` exists and `approve` ran with `3`; `001-alpha-twice`'s proposal says `depends_on: ["003"]` | `1` | `003-alpha-thrice <seal>` |
| `002-gamma`'s proposal says `depends_on: ["001"]`; `main` gains a commit that adds `openspec/changes/archive/001-alpha-twice/` as a copy of `001-alpha-twice` that is sealed | `2` | not stacked |
| `approve` ran with `2`; `001-alpha-twice/.run/stacked-on` in the checkout holds `002-gamma sha256:old overlap gamma,,beta` and a newline, then `junk`, then `001-alpha-twice x` | `1` | `002-gamma sha256:old overlap gamma,beta` |
| `approve` ran with `2`; `001-alpha-twice/.run/stacked-on` in the checkout holds `003-alpha-thrice sha256:old overlap alpha` | `1` | not stacked |

#### Scenario: Stacked folder replaced
- **WHEN** `approve` runs with the query `1` and then `3` on a repository built as the row `overlap-003.txt` of "Stacked approvals equal TypeScript's" builds it, which also holds the file `<root>/worktrees/repo/.stacked/003-alpha-thrice/note.txt`, written before the first run
- **THEN** the second run gives an `Output`, and the folder `<root>/worktrees/repo/.stacked/003-alpha-thrice` holds no `note.txt`
