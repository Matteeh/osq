## ADDED Requirements

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
