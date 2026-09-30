## MODIFIED Requirements

### Requirement: Scope violation recording
When `GitVcs` is selected, the runner SHALL hash every file status lists
before it spawns the agent, with null for a deleted file. After the agent exits
and before verify, a file SHALL count as changed during the task when status
lists it now or before spawn and its status code or hash differs. A changed
file SHALL be a scope violation when the task's scope does not cover its path,
as `scopeCoversPath` judges it without reading the disk, and it is outside the
change folder. So a file the task deleted is covered by the scope entry that
names it, exactly or through a glob. A file under `tests/` that status lists
as untracked after the agent exits and did not list before spawn SHALL NOT be
a scope violation. The runner SHALL append one `scope_violation` event whose
`files` lists the violations sorted, and log a warning. Outside an osq
worktree the task's outcome SHALL NOT change; inside one, "Violations kill in
a worktree" applies. Under `NoVcs`, scope checks SHALL stay as they are.

#### Scenario: Edit outside scope
- **WHEN** the agent edits a tracked file outside its scope and the task's verify passes
- **THEN** a `scope_violation` event names that file, and the task is done

#### Scenario: Human edit before spawn
- **WHEN** a file outside scope was modified before spawn and the agent leaves it alone
- **THEN** no `scope_violation` event is recorded

#### Scenario: Agent edits a dirty file
- **WHEN** a file outside scope was modified before spawn and the agent edits it again
- **THEN** a `scope_violation` event names that file

#### Scenario: New test file
- **WHEN** the agent creates `tests/extra.test.ts` outside its scope
- **THEN** no `scope_violation` event is recorded

#### Scenario: Scoped file deleted
- **WHEN** the agent deletes a tracked file its scope names exactly, and another that a scope glob covers
- **THEN** no `scope_violation` event is recorded

#### Scenario: File outside scope deleted
- **WHEN** the agent deletes a tracked file outside its scope
- **THEN** a `scope_violation` event names that file

### Requirement: Verified task commit
After a task in a worktree passes and its mutation check has run, the watcher
SHALL make one commit holding every path status lists that the task's `scope`
covers, a deleted path and a rename's source included, every untracked file
under `tests/`, and the change folder's `.run/done/<n>`,
`.run/results/<n>.md`, `.run/events/<n>.jsonl`, and `tasks.md` when they
exist. Its subject SHALL be `osq: <id> task <n> verified`, its message SHALL
come from "Osq commit message" with the task's title and outcome line, and its
author SHALL be `vcs.author`. The outcome line SHALL be `formatTaskOutcomeLine`
with symbols off and the whole seconds since the task's last `started` event,
0 without one. Anything else status lists SHALL stay uncommitted, so the next
check halts on it by name. Each cycle, before picking a task for a change that
is not halted, the watcher SHALL make the same commit, in task order, for
every task whose `.run/done/<n>` status lists as untracked and whose marker is
not `manual: true`.

#### Scenario: Two tasks, two commits
- **WHEN** a two-task change in a worktree runs and each task edits one file in its scope
- **THEN** the branch gains `osq: <id> task 1 verified` and `osq: <id> task 2 verified`, each holding its task's file and records, and the worktree is clean outside `.run/` after each

#### Scenario: New test file outside scope
- **WHEN** a task creates `tests/new.test.ts` outside its scope and passes
- **THEN** the task's commit holds `tests/new.test.ts`

#### Scenario: Commit left undone
- **WHEN** a task's done marker is written and the watcher stops before its commit
- **THEN** the next cycle commits it as `osq: <id> task <n> verified` before spawning the next task

#### Scenario: Deleted scoped file
- **WHEN** a task with `tests.modify: true` deletes `src/old.ts` and `tests/old.test.ts`, both in its scope, and passes
- **THEN** the task is done, its commit records both deletions, and the worktree is clean outside `.run/`
