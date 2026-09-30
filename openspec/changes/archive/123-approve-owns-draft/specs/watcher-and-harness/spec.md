## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/watcher/**, src/harness/**, src/core/run/**, src/core/lifecycle/**, tests/retry*.test.ts, tests/reject.test.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner,
process execution, deterministic task-scope resolution and hashing, shared
verification execution, agent harnesses, adapter registration, execution
manifest construction, and append-only execution lifecycle event contracts.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher, scope, verification, harness execution, or retry and rejection lifecycle events
- **THEN** system maps `src/watcher/**`, `src/harness/**`, `src/core/run/**`, `src/core/lifecycle/**`, `tests/retry*.test.ts`, and `tests/reject.test.ts` to watcher-and-harness

### Requirement: Lifecycle commands in a worktree
`retry`, `reject`, and `verified` SHALL act on the folder the change
locations module returns, so for a change that runs in a worktree they write
their markers in the worktree and never in the checkout. `rejectSpec` SHALL
read a change's markers in the change's own tree, move the change into that
tree's rejected directory, and then commit and remove the worktree as
"Rejection under version control" says. `retrySpec`'s recertification SHALL
run the task's verify and hash its scope in the change's own tree. osq SHALL
have no command that writes a done marker; only the watcher writes one.

#### Scenario: Reject a dead change in a worktree
- **WHEN** a change in a worktree has a dead task and a human runs `osq reject <id> --reason stop`
- **THEN** the change's branch holds the folder and its `.run/rejected.md` under the rejected directory, and the checkout's changes and rejected directories are unchanged

#### Scenario: Recertify in the worktree
- **WHEN** a done task in a worktree has a scope regression and its verify passes only in the worktree
- **THEN** `osq retry <id> <n>` recertifies it

#### Scenario: Manual done in the worktree
- **WHEN** a human runs `osq done <id> <n> --manual <reason>` for a change in a worktree
- **THEN** osq fails with an unknown command, and no `.run/done/<n>` is written in the worktree or the checkout

### Requirement: Rejection under version control
With `vcs.enabled` and `GitVcs` selected, after `rejectSpec` moves a change
in a worktree tree into that tree's rejected directory and records the
rejection, it SHALL commit, in the worktree, every path status lists under
the change's old folder and its rejected folder, with subject
`osq: <id> rejected`, the reason and `rejected to <path>` as body lines, the
trailer `Osq-Change: <folder>`, and author `vcs.author`, built by
`formatCommitMessage`. It SHALL then remove the worktree through
`worktreeRemove`, never by force, and keep the branch. When the worktree
still has other changes, or the commit or the removal fails, it SHALL keep
the worktree and report why. `osq reject` SHALL print
`  Worktree removed: <path>` or `  Worktree kept: <path> (<why>)`, then
`  Branch kept: osq/<folder>`. For a change in a stacked tree, `rejectSpec`
SHALL apply the same eligibility rules, then restore the change to the
checkout as "Stacked draft restore" says, delete the stacked approval
directory, move nothing else, and write no rejection record, because a
stacked approval has no branch to keep the plan. `osq reject` SHALL print
`  Withdrew stacked approval: <path>` in place of its `Destination` line,
then `  Restored draft: <path>`, the restored folder's path relative to the
project root.

#### Scenario: Reject removes a clean worktree
- **WHEN** a change in a worktree has a dead task and a human runs `osq reject <id> --reason stop`
- **THEN** the branch's newest commit is `osq: <id> rejected` holding the folder under the rejected directory and not under the changes directory, the worktree's directory and its `worktreeList` entry are gone, the branch remains, and the checkout's files are unchanged

#### Scenario: Dirty worktree kept
- **WHEN** the rejected change's worktree also has a modified file outside the change folder
- **THEN** the rejection commit is made without that file, the worktree and the file remain, and the output has a `Worktree kept:` line naming the worktree

#### Scenario: Not recreated after reject
- **WHEN** a change was rejected and its worktree removed, and `osq watch --once` runs
- **THEN** no worktree is created for its branch

#### Scenario: Reject a halted stacked change
- **WHEN** a stacked change halted with `dependency_changed` is rejected
- **THEN** its stacked approval directory is gone, no branch exists for it, the checkout holds its folder with the stacked copy's authored files and no `.run/approved`, and the output has the `Withdrew stacked approval:` line and then `  Restored draft: openspec/changes/<folder>`

### Requirement: Squash commit message
osq SHALL build the squash commit message for a change from the archived
change folder in its osq worktree, and SHALL write nothing while doing so.
It SHALL find that folder through the worktree trees `changeTrees` returns,
not through `listChanges`, so a checkout that already holds an archived
folder of the same name, as it does after `git merge --squash`, changes
nothing.
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
- **WHEN** task 2's `.run/done/2` frontmatter holds `manual: true`, as markers an older osq's `osq done --manual` wrote do
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

#### Scenario: Checkout already holds the archive
- **WHEN** the checkout has run `git merge --squash osq/<folder>`, so its archive holds `<folder>` too, and the worktree is kept
- **THEN** `osq message <id>` prints the same message as before the merge, with `Osq-Head` equal to the tip of `osq/<folder>`

### Requirement: Manual task completion lifecycle event
The harness event stream SHALL keep the typed `done_manual` event, with
payload `task` and `reason`, so task streams that older osq versions wrote
when a human marked a task done still parse. osq SHALL NOT append a
`done_manual` event.

#### Scenario: Typed done_manual event emission
- **WHEN** an archived task stream holds a `done_manual` event with `task` and `reason`
- **THEN** it parses as a typed `done_manual` event, and no osq command appends one
