## ADDED Requirements

### Requirement: Git state recording
<!-- source: src/core/vcs/snapshot.ts, src/watcher/git-guard.ts, src/watcher/runner.ts, tests/vcs-guard.test.ts -->
When `GitVcs` is selected, the runner SHALL record HEAD's commit and branch,
the index digest, and the stash list before it spawns the agent, and again
after the agent exits and before verify. When any of them differs, the runner
SHALL append one `vcs_violation` event with `moved`, the list of what differs
from `head`, `branch`, `index` and `stash`, and `before` and `after` holding
all four values. It SHALL log a warning that names what moved, how to put each
back, and that a human using git in this checkout during the task causes the
same result. The task's outcome SHALL NOT change. A git read that fails SHALL
record nothing and log a warning.

#### Scenario: Agent commits
- **WHEN** the agent commits its edit and the task's verify passes
- **THEN** a `vcs_violation` event lists `head` in `moved` with both commits, and the task is done

#### Scenario: Agent stashes
- **WHEN** the agent runs `git stash` on the checked-out branch
- **THEN** a `vcs_violation` event lists `stash` in `moved`, and HEAD is unchanged in `before` and `after`

#### Scenario: Agent checks out another branch
- **WHEN** the agent checks out another branch
- **THEN** a `vcs_violation` event lists `branch` in `moved`

#### Scenario: Agent stages a file
- **WHEN** the agent runs `git add` on a file in its scope
- **THEN** a `vcs_violation` event lists `index` in `moved`

#### Scenario: Outside git
- **WHEN** a task runs under `NoVcs`
- **THEN** no `vcs_violation` or `scope_violation` event is recorded

### Requirement: Scope violation recording
<!-- source: src/core/vcs/snapshot.ts, src/watcher/git-guard.ts, tests/vcs-guard.test.ts -->
When `GitVcs` is selected, the runner SHALL hash every file status lists
before it spawns the agent, with null for a deleted file. After the agent exits
and before verify, a file SHALL count as changed during the task when status
lists it now or before spawn and its status code or hash differs. A changed
file SHALL be a scope violation when it is outside the task's scope resolved
after the agent exits, and outside the change folder. The runner SHALL append
one `scope_violation` event whose `files` lists them sorted, and log a warning.
The task's outcome SHALL NOT change. Under `NoVcs`, scope checks SHALL stay as
they are.

#### Scenario: Edit outside scope
- **WHEN** the agent edits a tracked file outside its scope and the task's verify passes
- **THEN** a `scope_violation` event names that file, and the task is done

#### Scenario: Human edit before spawn
- **WHEN** a file outside scope was modified before spawn and the agent leaves it alone
- **THEN** no `scope_violation` event is recorded

#### Scenario: Agent edits a dirty file
- **WHEN** a file outside scope was modified before spawn and the agent edits it again
- **THEN** a `scope_violation` event names that file

### Requirement: Relative verify output and archive path
<!-- source: src/core/run/verification.ts, src/watcher/archiver.ts, tests/relative-paths.test.ts -->
The shared verification runner SHALL return output with the project root
replaced by relative paths, using the same rule as tool summaries, so
`verify_ran` events, dead and regressed markers, and prior failure context
never carry the project root. The `archived` event SHALL record `archivePath`
relative to the project root. Existing events and archives SHALL NOT be
rewritten.

#### Scenario: Absolute path in verify output
- **WHEN** a task's verify prints `<projectRoot>/src/a.ts` and fails
- **THEN** its `verify_ran` event and dead marker carry `src/a.ts` and not the project root

#### Scenario: Archived change
- **WHEN** a change is archived
- **THEN** its `archived` event's `archivePath` is `openspec/changes/archive/<folder>`

## MODIFIED Requirements

### Requirement: Shared executor prompt
<!-- source: src/harness/prompt.ts, src/harness/agy/agy.ts, src/harness/opencode/opencode.ts, src/harness/codex/codex-prompt.ts, tests/harness-prompt-injection.test.ts, tests/fixtures/prompts/** -->
Every textual harness SHALL deliver the prompt `buildExecutorPrompt` returns,
byte for byte, and SHALL keep its own delivery, arguments, and attachments. The
prompt SHALL name the task file, `proposal.md`, title, scope, entry files,
verification command, result destination, prior context, delta spec paths, and
living spec paths, then the managed executor steps, capability rules, managed
exit text, and the concrete result path. Its closing line SHALL also tell the
agent never to run git. It SHALL NOT name `features/` or a parent `spec.md`.

#### Scenario: Same task, three harnesses
- **WHEN** agy, codex, and opencode build argv for the same fixture task
- **THEN** each carries the same prompt text, equal to its checked-in golden prompt

#### Scenario: Specs named for every harness
- **WHEN** a change writes a delta spec and its proposal reads a living capability that exists
- **THEN** every harness prompt lists the delta spec path under `Delta Specs:` and the living spec path under `Living Capability Specs:`

#### Scenario: Managed text reaches the prompt
- **WHEN** a harness prompt is built
- **THEN** it contains every managed executor step line and every managed exit line verbatim

#### Scenario: No git
- **WHEN** a harness prompt is built
- **THEN** its last line says never to run git
