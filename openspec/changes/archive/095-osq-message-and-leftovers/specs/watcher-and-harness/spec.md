## ADDED Requirements

### Requirement: Squash commit message
<!-- source: src/core/run/squash-message.ts, tests/squash-message.test.ts -->
osq SHALL build the squash commit message for a change from the archived
change folder in its osq worktree, and SHALL write nothing while doing so.
The message SHALL be, in order:

- The subject `osq: <id> <folder words>`, where `<id>` is the folder's
  numeric prefix and `<folder words>` is the rest of the folder name with each
  `-` replaced by a space.
- A blank line, then the proposal's `## Goal` section, trimmed.
- A blank line, then one outcome line per entry of `tasks.md`, in order:
  `[manual] task <n>: <title>` when the task's `.run/done/<n>` frontmatter
  holds `manual: true`, and `[verified] task <n>: <title>` otherwise.
- A blank line, then the trailers, one `<key>: <value>` per line:
  `Osq-Change: <folder>`; `Osq-Base: <.run/base>`; `Osq-Head: <sha>`, the
  head of the worktree on `osq/<folder>` as `worktreeList` reports it;
  `Osq-Approved: <.run/approved>`; `Osq-Approved-By: <.run/approver>`; then
  `Osq-Model: <harness> <model>` once for each distinct value, and
  `Osq-Version: <osqVersion>` once for each distinct value, in task order,
  as `readCommitTrailers` reads them from each task's events.
- One final newline.

Each file value SHALL be trimmed. A trailer whose file is missing or empty
SHALL be left out.

osq SHALL refuse, writing nothing, in these cases:

- With `vcs.enabled` off or `NoVcs` selected, it SHALL fail with
  `osq message needs vcs.enabled and git`.
- When the change is active in its worktree, it SHALL fail with
  `<folder> has not archived on osq/<folder>`.
- When no osq worktree holds an archived folder that matches the id, as
  `findChange` matches ids, it SHALL fail with
  `No archived change "<id>" in an osq worktree`.
- When `awaitedDependencies` returns any entry for the archived folder, the
  change is stacked on a dependency that has not landed, and it SHALL fail
  with `<folder> is stacked on <dependency folders, comma-separated>, which
  has not landed; land it first`.

#### Scenario: Message after archive
- **WHEN** a two-task change approved into a worktree has run to its archive commit, and both tasks' `started` events name the same harness, model, and osq version
- **THEN** the message's subject is `osq: <id> <folder words>`, its body holds the goal and `[verified] task 1: <title>` and `[verified] task 2: <title>`, and `git interpret-trailers --parse` prints `Osq-Change`, `Osq-Base`, `Osq-Head` equal to the tip of `osq/<folder>`, `Osq-Approved`, `Osq-Approved-By`, one `Osq-Model: <harness> <model>`, and one `Osq-Version`

#### Scenario: Two models
- **WHEN** task 1's last `started` event names harness `pi` and model `deepseek-flash`, and task 2's names `pi` and `deepseek-pro`
- **THEN** the trailers hold `Osq-Model: pi deepseek-flash` and then `Osq-Model: pi deepseek-pro`

#### Scenario: Manual task
- **WHEN** task 2 was completed with `osq done --manual`
- **THEN** its outcome line is `[manual] task 2: <title>`

#### Scenario: Not archived yet
- **WHEN** the change still runs in its worktree
- **THEN** it fails with `<folder> has not archived on osq/<folder>` and writes nothing

#### Scenario: Stacked on an unlanded dependency
- **WHEN** the change archived on a branch cut from its dependency's archive commit, and the dependency has not landed
- **THEN** it fails naming the dependency folder

#### Scenario: Flag off
- **WHEN** `vcs.enabled` is off
- **THEN** it fails with `osq message needs vcs.enabled and git`
