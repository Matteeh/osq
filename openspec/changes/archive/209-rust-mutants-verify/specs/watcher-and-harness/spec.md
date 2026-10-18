# Spec Delta: watcher-and-harness

## MODIFIED Requirements

### Requirement: Change folder in verify environment
`runVerificationCommand` SHALL take the change folder as a required argument,
either an absolute path or null. It SHALL run the command with its role's
environment from "Role environments", the verify role unless the caller names
prepare, plus `OSQ_CHANGE` set to that path. With null, it SHALL run with
`OSQ_CHANGE` removed, even when osq's own environment has it. Every watcher
verify SHALL pass the change folder it runs for: a task's pre-spawn and
post-exit verify, the change-level verify, the archive-time verifies and
check, and the scope-regression audit. So SHALL the recertification verify of
`osq retry`. A land's sync SHALL run an archived change's verify and `check`
with null, because its deltas are already in the living spec.

With a change folder whose `.run/base` holds a commit, and a project root
whose `Vcs` is git, it SHALL also write `vcs.patch(<base>)`, the working
tree's diff against that commit with untracked files included, to a new file
in a temporary folder outside the project, set `OSQ_DIFF` to that file's
absolute path, and remove the folder once the command has ended. In every
other case, including a `patch` that fails, it SHALL run the command with
`OSQ_DIFF` removed, even when osq's own environment has it. So the verify
command reads the change's diff without running git itself.

#### Scenario: Task verify sees its change
- **WHEN** the watcher runs a task whose verify prints `OSQ_CHANGE`
- **THEN** the recorded `verify_ran` output is the absolute path of the change folder

#### Scenario: Archived check runs without it
- **WHEN** a land's sync runs an archived change's `check` command while osq's environment has `OSQ_CHANGE` set
- **THEN** the command sees no `OSQ_CHANGE`

#### Scenario: Verify gets the change's diff
- **WHEN** `runVerificationCommand` runs a command for a change folder in a git repository whose `.run/base` holds commit `B`, after `B` the tracked file `src/a.rs` changed and the untracked file `src/b.rs` was added, and the command prints the file `OSQ_DIFF` names
- **THEN** the output equals `vcs.patch(B)` and names both `src/a.rs` and `src/b.rs`, and the file no longer exists once the call returns

#### Scenario: No diff without a base
- **WHEN** `runVerificationCommand` runs a command that prints whether `OSQ_DIFF` is set, while osq's own environment sets `OSQ_DIFF` to `/stale.diff`, in each case below
- **THEN** the command sees no `OSQ_DIFF`:

| Case |
|---|
| the change folder is null |
| the change folder has no `.run/base` |
| `.run/base` is empty |
| the project root is not a git repository |
