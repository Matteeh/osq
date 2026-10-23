## ADDED Requirements

### Requirement: Worktree halt
A halt of a change in an osq worktree SHALL be recorded as TypeScript's
`haltWorktreeChange` records it: `.run/regressed/change.md` of the change
holding `---\nreason: <reason>\n---\n<detail>\n`, then one `regressed`
event appended to `.run/events/change.jsonl` with the `task` `change`,
the `reason` and the `output` `<detail>`, where `<detail>` is the tail
TypeScript's `tailVerifyOutput` keeps of the halt's detail with the
config's `limits.markerOutputLines` and `limits.markerLineChars`. The
reasons are rust-core's `worktree_off_branch`, `worktree_dirty` and
`commit_failed`. `run` then fails with `spec <id> halted (<reason>)`,
`<id>` being the folder's leading digits, unless the requirement that
halts gives another text.

#### Scenario: Failed commits halt the change
- **WHEN** a test runs the "Verified task commit fails" and "Dead task commit fails" cases
- **THEN** each also leaves the worktree's `openspec/changes/001-a/.run/regressed/change.md` starting with `---\nreason: commit_failed\n---\n` and holding `refused by hook`, and the last line of its `.run/events/change.jsonl` parses with core's `parse_event_line` as a `regressed` event whose `task` is `change`, whose `reason` is `commit_failed` and whose `output` holds `refused by hook`

### Requirement: Worktree checks
For a change in an osq worktree, `run` SHALL, after the git check of "Run
refusals" and before its marker refusals, with a `GitVcs` at the tree's
root with the config's `timeouts`:

1. commit each pending verified task, as TypeScript's
   `commitPendingVerifiedTasks` does: each `.run/done/<n>` of the change
   whose `<n>` is all digits and that rust-vcs `status` lists with the
   code `??` or a code starting with `A`, in numeric order, skipping one
   whose frontmatter holds `manual: true`, committed as "Verified task
   commit" commits task `<n>`; a failed commit halts the change with
   `commit_failed` and git's error as "Worktree halt" says, and `run`
   fails with the text "Verified task commit" gives for task `<n>`;
2. halt the change with `worktree_off_branch` when rust-vcs `head` names
   a branch other than `osq/<folder>`, with the branch as the detail, or
   `detached HEAD` when it names none;
3. halt it with `worktree_dirty` when any `path` or `from` of `status` is
   neither the change's `tasks.md` nor under its `.run/`, with those paths,
   sorted and without repeats, one per line, as the detail.

A halt here happens before the lock, the approval check and the start, as
TypeScript's `checkWorktree` does.

#### Scenario: Worktree halts before the start
- **WHEN** a test builds the repository "Worktree run finds its tree" builds, with `fake-pi-mode` listed in the repository's `.git/info/exclude`, changes the worktree as the row says, and runs `run` with `1` and `1` with the fake pi in the `done` mode
- **THEN** it gives a `Failed` error for the command `run` with the message `spec 001 halted (<reason>)`, the worktree's `openspec/changes/001-a/.run/regressed/change.md` is `---\nreason: <reason>\n---\n<detail>\n`, the last line of its `.run/events/change.jsonl` is a `regressed` event whose `task` is `change`, whose `reason` is the row's and whose `output` is the row's detail, no `.run/events/1.jsonl` line is a `started` event, and the tip of `osq/001-a` is still the approval commit, where `\n` stands for a newline:

| Change | Reason | Detail |
|---|---|---|
| runs `git checkout -q --detach` | `worktree_off_branch` | `detached HEAD` |
| runs `git checkout -q -b other` | `worktree_off_branch` | `other` |
| writes `src/b.txt` and `other.txt` | `worktree_dirty` | `other.txt\nsrc/b.txt` |
| changes the committed `src/keep.txt` | `worktree_dirty` | `src/keep.txt` |

#### Scenario: Worktree check allows the change's records
- **WHEN** a test builds the repository "Worktree halts before the start" builds, writes `openspec/changes/001-a/.run/notes.txt` in the worktree, and runs `run` with `1` and `1` with the fake pi in the `done` mode
- **THEN** it gives the output `Task 1 of 001-a done\n`

#### Scenario: Pending verified commit
- **WHEN** a test builds the repository "Worktree halts before the start" builds, adds to the worktree's change `tasks/2.md`, a copy of `tasks/1.md`, writes the change's new seal to `.run/approved` and commits both, then writes the row's `.run/done/1`, `.run/results/1.md` holding `## Changed\n\nA file.\n` and `other.txt`, and runs `run` with `1` and `2`
- **THEN** it gives a `Failed` error for the command `run` with the message `spec 001 halted (worktree_dirty)`, and the tip of `osq/001-a` is the row's:

| Done marker | Tip |
|---|---|
| `2026-01-01T00:00:00.000Z\n` | a commit whose message starts with `osq: 001 task 1 verified\n` and whose `git show --no-renames --name-status --format=` prints `A` for `openspec/changes/001-a/.run/done/1` and `openspec/changes/001-a/.run/results/1.md` and nothing else |
| `---\nmanual: true\n---\n` | the commit that added `tasks/2.md` |

### Requirement: Commit catch-up
For a change in an osq worktree whose `.run/regressed/change.md` exists,
`run` SHALL, before "Worktree checks", act as TypeScript's
`catchUpWorktreeCommits` does with config's `gates.commitRetries`:

- when the marker's frontmatter `reason` is not `commit_failed`, or when
  `.run/events/change.jsonl` holds more `regressed` events with the reason
  `commit_failed` after its last `retry` event whose `target` is `change`
  and that has no `automatic` key than `gates.commitRetries`, refuse with
  `Change <folder> is halted (<reason>); run osq retry <id> change`,
  writing nothing;
- otherwise commit each pending dead task: each `.run/dead/<n>.md` whose
  `<n>` is all digits and that `status` lists with the code `??` or a code
  starting with `A`, in numeric order, recorded as "Dead task commit"
  records task `<n>` with its marker's frontmatter `reason`, or
  `no_result` when it has none, except that a `.run/dead/<n>.patch` that
  already exists is kept; a failure halts the change again with
  `commit_failed` as "Worktree halt" says, and `run` fails with the text
  "Dead task commit" gives;
- then clear the halt as rust-retry "Retry record" clears it for the
  target `change` with the reason `commit_failed`, with the `retry` event's
  `automatic` set to true, and go on to "Worktree checks".

#### Scenario: Commit catch-up
- **WHEN** a test builds the repository "Worktree halts before the start" builds with a refusing `.git/hooks/pre-commit`, runs `run` with `1` and `1` with the fake pi in the row's mode, removes the hook, and runs `run` with `1` and `1` again
- **THEN** the second run gives a `Failed` error for the command `run` with the row's message, the worktree holds `openspec/changes/001-a/.run/regressed/change.1.md` and no `.run/regressed/change.md`, the last line of `.run/events/change.jsonl` is a `retry` event with the data `{"target":"change","reason":"commit_failed","attempt":2,"automatic":true}`, the message of the tip of `osq/001-a` starts with the row's subject and a newline, and the row's file holds the row's text:

| Mode | Message | Subject | File | Text |
|---|---|---|---|---|
| `done` | `Task 1 of 001-a is done; nothing to run` | `osq: 001 task 1 verified` | `src/a.txt` at the tip | `a` |
| `outside` | `Task 1 of 001-a is dead; nothing to run` | `osq: 001 task 1 dead, reason scope_violation` | `openspec/changes/001-a/.run/dead/1.patch` at the tip | `+outside` |

#### Scenario: Catch-up runs out
- **WHEN** a test builds the repository "Worktree halts before the start" builds with a refusing `.git/hooks/pre-commit` and the row's `commitRetries` under `[gates]` in the checkout's `osq.toml`, runs `run` with `1` and `1` with the fake pi in the `done` mode, then runs `run` with `1` and `1` the row's number of further times with the hook still there
- **THEN** the last run gives a `Failed` error for the command `run` whose message is the row's, or starts with it when the row says so, and the worktree's `openspec/changes/001-a/.run/regressed/change.md` starts with `---\nreason: commit_failed\n---\n`:

| `commitRetries` | Further runs | Message |
|---|---|---|
| 0 | 1 | `Change 001-a is halted (commit_failed); run osq retry 001 change` |
| 1 | 1 | starts with `task 1 of 001-a is done, but osq could not commit it: ` |
| 1 | 2 | `Change 001-a is halted (commit_failed); run osq retry 001 change` |

#### Scenario: Other halts refuse
- **WHEN** a test builds the repository "Worktree halts before the start" builds, writes the worktree's `openspec/changes/001-a/.run/regressed/change.md` as `---\nreason: worktree_dirty\n---\nother.txt\n`, and runs `run` with `1` and `1`
- **THEN** it gives a `Failed` error for the command `run` with the message `Change 001-a is halted (worktree_dirty); run osq retry 001 change`, and the worktree's files and git status are as they were before the run

## MODIFIED Requirements

### Requirement: Run refusals
Before it writes anything, `run` SHALL load `osq.toml`, then find the first
active change matching the id as rust-approve "Approve lookup" does, and
refuse with `FeatureError::failed("run", ..)` and the text "Run refusal
texts" gives: a config error, no matching change, no `tasks/<task>.md`, an
executor harness other than `pi`, and a root outside git. For a change in
an osq worktree it then runs "Commit catch-up" and "Worktree checks".
It then refuses, with the texts "Run refusal texts" gives, a task holding
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
SHALL leave the done marker and the task's files as they are, halt the
change with `commit_failed` and the `VcsError`'s display as "Worktree
halt" says, and fail with `task <task> of <folder> is done, but osq could
not commit it: <error>`, `<error>` being that display.

#### Scenario: Verified task commit
- **WHEN** a test runs `run` as "Worktree run finds its tree" does
- **THEN** the tip of `osq/001-a` is the commit the run made, its message, with the elapsed seconds written `<s>`, is `osq: 001 task 1 verified\n\n<title>\n[ok] task 1 verified (elapsed: <s>s)\n\nOsq-Change: 001-a\nOsq-Task: 1\nOsq-Model: pi <model>\nOsq-Version: <version>\n`, where `<title>` is task 1's title and `<model>` and `<version>` are the `model` and `osqVersion` of the task's `started` event, and `git show --no-renames --name-status --format=` of it prints `A` for `openspec/changes/001-a/.run/done/1`, `openspec/changes/001-a/.run/events/1.jsonl`, `openspec/changes/001-a/.run/results/1.md` and `src/a.txt`, and `M` for `openspec/changes/001-a/tasks.md`, and nothing else

#### Scenario: Verified task commit fails
- **WHEN** a test runs `run` as "Worktree run finds its tree" does, with an executable `.git/hooks/pre-commit` in the repository that prints `refused by hook` and exits 1
- **THEN** it gives a `Failed` error for the command `run` whose message starts with `task 1 of 001-a is done, but osq could not commit it: ` and holds `refused by hook`, the worktree holds `openspec/changes/001-a/.run/done/1`, and the tip of `osq/001-a` is still the approval commit

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

When a step fails, `run` SHALL halt the change with `commit_failed` and
the error's display as "Worktree halt" says, and fail with `task <task>
of <folder> died: <reason>; osq could not commit it: <error>`, `<error>`
being that display, leaving the files as that step left them; otherwise
it fails as "Dead record" says.

#### Scenario: Dead task commit
- **WHEN** a test builds the repository "Worktree run finds its tree" builds, runs the fake pi in the `outside` mode, and runs `run` with `1` and `1`
- **THEN** it gives a `Failed` error for the command `run` with the message `task 1 of 001-a died: scope_violation`, the worktree no longer holds `src/a.txt` or `other.txt`, its `openspec/changes/001-a/.run/dead/1.patch` holds `+outside` and `+a`, the tip of `osq/001-a`'s message, with the elapsed seconds written `<s>`, starts with `osq: 001 task 1 dead, reason scope_violation\n\n<title>\n[dead] task 1 dead (reason: scope_violation, elapsed: <s>s)\n\nOsq-Change: 001-a\nOsq-Task: 1\n`, and `git show --no-renames --name-status --format=` of it prints `A` for `openspec/changes/001-a/.run/dead/1.md`, `openspec/changes/001-a/.run/dead/1.patch` and `openspec/changes/001-a/.run/events/1.jsonl` and nothing else

#### Scenario: Dead task commit fails
- **WHEN** a test runs the "Dead task commit" case with an executable `.git/hooks/pre-commit` in the repository that prints `refused by hook` and exits 1
- **THEN** it gives a `Failed` error for the command `run` whose message starts with `task 1 of 001-a died: scope_violation; osq could not commit it: ` and holds `refused by hook`, and the worktree holds `openspec/changes/001-a/.run/dead/1.md` and `openspec/changes/001-a/.run/dead/1.patch`
