## MODIFIED Requirements

### Requirement: Steering lookup
`plan <id>` SHALL read the root's config with rust-config `load_config` and
list the changes it may steer. With `vcs.enabled` off, they are rust-storage
`list_changes` of the root. With it on, they are rust-storage
`list_tree_changes` of rust-storage `change_trees` of the root, with one
candidate per entry of rust-vcs `worktree_list` of a `GitVcs` at the root
with the config's `timeouts`, and no stacked folders. A change is matched
when its folder name matches the id as TypeScript's `matchesFolder` does,
and read with rust-storage `read_change`.

`plan <id>` SHALL steer the first active change that matches; else, with
vcs on, the first archived change that matches, sits in a tree that names
it, and has a trigger. Its steering triggers are those TypeScript's
`deriveSteering` gives, in its order: none unless `.run/approved` exists;
then the change trigger of `.run/regressed/change.md`, `conflict` for
`sync_conflict`, `requirement_changed` for `requirement_changed` and
`regression` for `verify_red`, `verify_path_missing` or `sync_verify_red`;
then each task file's trigger in task order, `regression` for a regressed
marker unless its reason is `scope_regression` and `verification_passed`
is `true`, else, for a task with no done marker, `blocked` for a dead marker
whose reason is `blocked` or `entry_missing` and `stuck` for one whose
`stuck` is `true`.

When no change matches, or the active change that matches sits in the root
and has no trigger, `plan` SHALL fail with
`No active change matching "<id>" needs steering; Rust osq plan <id> steers a change only.`
and write nothing. When the active change that matches sits in a tree that
names it and has no trigger, `plan` SHALL fail with
`<folder> is approved and needs no steering; osq plan <id> reopens an approved change only when it needs steering`,
`<id>` being the folder's leading digits, and write nothing. When
`read_change` fails, `plan` SHALL fail with `Cannot read <folder>: <error>`,
and a config or git error SHALL fail `plan` with its display, each writing
nothing.

#### Scenario: Nothing to steer
- **WHEN** `plan` runs with the row's id on a copy of `crates/features/plan/tests/fixtures/steer-project/`
- **THEN** it gives a `Failed` error for the command `plan` with the row's message, and every file in the copy is unchanged:

| Id | Message |
|---|---|
| `8` | `No active change matching "8" needs steering; Rust osq plan 8 steers a change only.` |
| `009-unapproved` | `No active change matching "009-unapproved" needs steering; Rust osq plan 009-unapproved steers a change only.` |
| `99` | `No active change matching "99" needs steering; Rust osq plan 99 steers a change only.` |

### Requirement: Steering prompt
`plan <id>` on a change with triggers SHALL write `plan-prompt.md` into the
change's folder, in whichever tree it sits, as TypeScript's `planCommand`
writes it: the "Plan prompt" sections for the root and the change, with no
landed dependencies, the change's own `brief.md`, and the proposal's
`title`, or the id as given when the proposal has none; then an empty line
and the steering section TypeScript's `buildSteeringSection` gives, with no
newline at the end. The section's lines are:

- `## Steering`, an empty line, and
  `osq halted this change and asks you to revise its plan.`;
- per trigger, an empty line,
  `### <target> <trigger> (<reason>)`, `<target>` being `change` or
  `task <n>`, then `Evidence: <marker path>`, an empty line, and the
  marker's frontmatter body, trimmed, between two lines of three
  backticks. The marker is `.run/regressed/<target>.md` for a change or a
  regression and `.run/dead/<n>.md` otherwise, its path the change folder
  joined with it. With vcs on, a `requirement_changed` trigger's lines are
  followed by one block per changed requirement: an empty line,
  `#### <capability>: <requirement> on <branch>`, an empty line, then the
  requirement's `raw` text at `<branch>` between two lines of three
  backticks, or `Removed on <branch>.` when `<branch>` has no such
  requirement;
- an empty line, then
  `The change runs in <tree root>; read its code there. Edit only <change folder>.`;
- when a trigger is `conflict`, `requirement_changed`, or a `regression`
  with the reason `sync_verify_red`:
  `Approval restarts osq/<folder> from <branch>, and every task runs again.`
  when one is `conflict`, else
  `Approval merges <branch> into osq/<folder> without running verify; add a task that makes the merged tree pass.`;
- `Every task runs again after the restart. Revise any task the conflict shows is wrong.`
  when a trigger is `conflict`, else
  `Done tasks stay done: <ids>. Add a task for new work instead of rewriting a done one.`,
  `<ids>` being the task ids with a done marker and no regressed marker,
  joined by `, `, or `none`;
- ``Run `osq lint <id>` and fix every finding. A human runs `osq approve <id>`, and the run continues from the first task that is not done.``,
  `<id>` being the folder's leading digits.

`<tree root>` is the root of the tree the change sits in. `<branch>` is
`main` with vcs off; with vcs on it is rust-vcs `default_branch` of a
`GitVcs` at the tree root with the config's `timeouts`, falling back to the
config's `vcs.defaultBranch`, else `main`. The changed requirements are
those TypeScript's `changedRequirements` gives: for each folder under the
change's `specs/`, sorted by name, whose `spec.md` reads, the names of its
rust-specs `parse_delta` `modified` blocks, then `removed`, then `renamed`
sources, each kept when the requirement's `raw` text in rust-specs
`parse_living_spec` of `openspec/specs/<capability>/spec.md` differs
between the base and `<branch>`, both read with rust-vcs `show`, a missing
file or requirement counting as no text. The base is the trimmed text of
`.run/requirements-base`, else of `.run/base`, when one is not blank; with
neither, the base side has no text. With vcs off no requirement block
follows a `requirement_changed` trigger.

#### Scenario: Steering equals TypeScript's
- **WHEN** `plan` runs with the row's id on a new copy of `crates/features/plan/tests/fixtures/steer-project/`, a copy of `openspec/changes/278-rust-plan-steer/fixture/steer-project/`
- **THEN** the output equals `<golden>.out.txt` and the change folder's `plan-prompt.md` equals `<golden>.prompt.txt` in `crates/features/plan/tests/fixtures/steer-golden/`, a copy of `openspec/changes/278-rust-plan-steer/golden/`, with the copy's root written `<root>`, and no other file in the copy changes:

| Id | Golden |
|---|---|
| `1` | `blocked-001` |
| `002` | `stuck-002` |
| `003-regression` | `regression-003` |
| `4` | `conflict-004` |
| `5` | `requirement-005` |
| `6` | `sync-red-006` |
| `7` | `many-007` |
| `10` | `untitled-010` |

### Requirement: Steering handoff
After writing `plan-prompt.md`, `plan <id>` SHALL return the "Plan
handoff" text for the change with the next step
`dead (needs steering) — osq plan <id>`, `<id>` being the folder's leading
digits, and `<folder path>` being the path of the change's folder in the
tree it sits in. The `/osq-plan` line follows when
`<root>/.claude/commands/osq-plan.md` is a file in the root `plan` runs on.

#### Scenario: Steering handoff with the slash command
- **WHEN** `plan` runs with the id `1` on a new copy of `crates/features/plan/tests/fixtures/steer-project/` that also holds the file `.claude/commands/osq-plan.md`
- **THEN** the output is `blocked-001.out.txt` in `crates/features/plan/tests/fixtures/steer-golden/`, with the copy's root written `<root>`, followed by an empty line, `In Claude Code, /osq-plan 001 does the same.` and a newline

## ADDED Requirements

### Requirement: Steering in worktrees
With vcs on, `plan <id>` SHALL steer a change that sits in an osq worktree,
active or archived, and an active change in the root, as TypeScript's
`osq plan <id>` does with git on, by the "Steering lookup", "Steering
prompt" and "Steering handoff" requirements.

#### Scenario: Steering in worktrees equals TypeScript's
- **WHEN** a test builds the scratch repository `openspec/changes/291-rust-plan-steer-worktrees/golden/print-steer-worktree-goldens.mjs.txt` describes, from `crates/features/plan/tests/fixtures/steer-worktrees/`, a copy of `openspec/changes/291-rust-plan-steer-worktrees/fixture/steer-worktrees/`, and runs `plan` with the row's id on `<scratch>/repo`
- **THEN** the output equals the row's `<golden>.out.txt` and the row's change folder's `plan-prompt.md` equals `<golden>.prompt.txt` in `crates/features/plan/tests/fixtures/steer-worktrees-golden/`, a copy of `openspec/changes/291-rust-plan-steer-worktrees/golden/`, with the scratch folder written `<scratch>`:

| Id | Change folder | Golden |
|---|---|---|
| `1` | `<scratch>/trees/001-blocked/openspec/changes/001-blocked` | `blocked-001` |
| `002` | `<scratch>/trees/002-requirement/openspec/changes/002-requirement` | `requirement-002` |
| `3` | `<scratch>/trees/003-land-stop/openspec/changes/archive/003-land-stop` | `land-stop-003` |
| `5` | `<scratch>/repo/openspec/changes/005-conflict` | `conflict-005` |

#### Scenario: Healthy worktree change
- **WHEN** a test builds the same scratch repository and runs `plan` with the id `4` on `<scratch>/repo`
- **THEN** it gives a `Failed` error for the command `plan` with the message `004-healthy is approved and needs no steering; osq plan 004 reopens an approved change only when it needs steering`, and `<scratch>/trees/004-healthy/openspec/changes/004-healthy/plan-prompt.md` does not exist
