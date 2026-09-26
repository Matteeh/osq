## ADDED Requirements

### Requirement: Osq commit message
<!-- source: src/core/run/commit-message.ts, tests/commit-message.test.ts -->
One function SHALL build every commit message osq makes for a task: the
subject, a blank line, the task title and the outcome line on their own lines,
a blank line, and trailers `Osq-Change: <folder>`, `Osq-Task: <n>`,
`Osq-Model: <harness> <model>`, and `Osq-Version: <osqVersion>`. The model
and version SHALL come from the last `started` event in
`.run/events/<n>.jsonl`; without one, those two trailers SHALL be left out.
The caller SHALL supply the outcome line, as `formatTaskOutcomeLine` writes it
with symbols off.

#### Scenario: Trailers parse
- **WHEN** a task's events hold a `started` event with harness `pi`, model `deepseek-flash`, and osqVersion `0.2.1`, then a second one with model `deepseek-pro`
- **THEN** `git interpret-trailers --parse` over the message prints `Osq-Change`, `Osq-Task`, `Osq-Model: pi deepseek-pro`, and `Osq-Version: 0.2.1`

#### Scenario: No started event
- **WHEN** the task's events file is missing
- **THEN** the message carries only the `Osq-Change` and `Osq-Task` trailers

### Requirement: Dead task record
<!-- source: src/core/run/dead-commit.ts, tests/dead-commit.test.ts -->
Given a `Vcs` for an osq worktree, a change folder inside it, a task number, a
reason, the task title, and the outcome line, the dead record SHALL, in this
order: write `patch()` to `.run/dead/<n>.patch`; discard every path `status`
reports outside the change folder, a rename's source included; then commit
whichever of `.run/dead/<n>.md`, `.run/dead/<n>.patch`, and
`.run/events/<n>.jsonl` exist, with subject
`osq: <id> task <n> dead, reason <reason>`, the message from "Osq commit
message", and author `vcs.author`. It SHALL return the new commit. It SHALL
never discard or commit anything else inside the change folder, so for
`spec_conflict` the human's edits to the folder stay uncommitted. When
`vcs.author` is unset it SHALL fail before writing anything.

#### Scenario: Agent edits put back
- **WHEN** a task dies with reason `verify_red` after the agent modified a tracked file and created `src/new.ts` in the worktree
- **THEN** the branch gains one commit holding only the three `.run/` files, the worktree status is empty outside `.run/`, and `git apply` of the committed patch on the worktree restores both edits

#### Scenario: Patch before discard
- **WHEN** discarding fails
- **THEN** `.run/dead/<n>.patch` already holds the agent's edits

#### Scenario: Spec conflict
- **WHEN** a task dies with reason `spec_conflict` after `tasks/1.md` in the worktree's change folder was edited
- **THEN** the dead commit holds only `.run/` files, and the edit to `tasks/1.md` remains, uncommitted
