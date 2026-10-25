## MODIFIED Requirements

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
the `VcsError`'s display. The worktrees `change_trees` is built from are
each one on a branch `osq/<folder>` that holds
`openspec/changes/<folder>/.run/approved` or
`openspec/changes/archive/<folder>/.run/approved` as a file. With git on and
no active match, `approve` SHALL take the first archived entry of those
trees, in that order, that lies in a tree whose `folder` is not none,
matches the query, and has steering triggers as "Steering refusal" derives
them, as TypeScript's `listArchivedSteering` finds one. With no match,
`approve` SHALL fail with `Spec "<query>" not found in <changes>`, where
`<query>` is the argument as given and `<changes>` is the root joined with
`openspec/changes`, shown with `display()`. When `parse_change_id` refuses the query, `approve` and
`reject` SHALL instead fail, at the point they would refuse a query that
matches nothing, with the `ChangeIdError`'s display as the message. No
other archived folder, and no rejected folder, ever matches.

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

#### Scenario: Archived changes found for steering
- **WHEN** `approve` runs with the query `1`, calling the feature's `run`, on a scratch repository built as `golden/print-default-branch-goldens.mjs.txt` builds the case `merge-001`, with the `osq.toml` of "Default-branch worktree approvals", changed as the row says
- **THEN** it gives a `Failed` error displayed `approve failed: ` and the row's message, where `<changes>` is the root joined with `openspec/changes`, every `osq/` branch points where it pointed before the run, the tree record gains no line, and every file under the worktree's `openspec/changes/` keeps its bytes:

| Change | Message |
|---|---|
| `.run/regressed/change.md` holds `reason: verify_red` | `Change 001-alpha-twice needs steering: change regression (verify_red). Rust approve steers an archived change only past a default-branch trigger.` |
| no `.run/regressed/change.md` | `Spec "1" not found in <changes>` |

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
- an archived change with no default-branch trigger, with
  `Change <folder> needs steering: <triggers>. Rust approve steers an archived change only past a default-branch trigger.`;
- with git on, a change in the root's own tree, with
  `Change <folder> needs steering: <triggers>. Rust approve steers a change with git on only in its worktree.`,

where `<triggers>` are every trigger shown, joined by `, `. A change in an
osq worktree with a default-branch trigger is approved as "Default-branch
approval" says. Every other change with triggers, a change with git off
and a default-branch trigger included, is approved as "Steered approval"
says. A change in an osq worktree with no triggers goes on to the checks
the other approve requirements name.

#### Scenario: Steering triggers
- **WHEN** `approve` runs with the query `1`, with git off, on a root whose one active change folder `001-a` is a valid change folder holding `tasks/1.md` and `tasks/2.md`, with the row's files under `.run/`, each marker's frontmatter written as the row gives it, calling the feature's `run`, so no event is delivered
- **THEN** it gives the row's `Failed` message and every file under `.run/` keeps its bytes; or, where the row says approved, it gives the `Output` `Approved 001 (001-a)\n  Hash: <seal>\n`, `.run/approved` holds the folder's seal and a newline, and no `.run/events/change.jsonl` is written; or, where the row says steered, it gives that `Output` followed by `  Continues from task <n>\n` for the row's task, `.run/approved` holds the seal and a newline, `.run/events/change.jsonl` holds one `approved` line whose `hash` is the seal and whose `targets` are the row's, and every other file under `.run/` keeps its bytes:

| Files under `.run/` | Result |
|---|---|
| `approved`, `regressed/change.md` with `reason: sync_conflict` | steered, targets `change`, task 1 |
| `approved`, `regressed/change.md` with `reason: requirement_changed` | steered, targets `change`, task 1 |
| `approved`, `regressed/change.md` with `reason: sync_verify_red` | steered, targets `change`, task 1 |
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

### Requirement: Steered approval
`approve` SHALL approve a change with triggers that "Steering refusal" does
not refuse and does not send to "Default-branch approval" as TypeScript's
`approveSteeredChange` in `src/core/spec/approve-steer.ts` approves one in
its worktree, and as its `approveSpec` in `src/core/spec/approve.ts`
approves one in place with git off, keeping every done task. After
"Approve validation" passes, which validates the change's folder against
the root's living specs, and with `<seal>` the seal rust-storage
`change_folder_seal` gives for that folder, `approve` SHALL, in this order:

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
| `blocked-001` with its markers written in the checkout's folder, which is not moved, and no worktree | `Change 001-alpha-twice needs steering: task 1 blocked (blocked). Rust approve steers a change with git on only in its worktree.` |
| `blocked-001` with no `author` in `osq.toml` | `vcs.author is required when vcs.enabled is true` |

## ADDED Requirements

### Requirement: Default-branch approval
`approve` SHALL approve a change in an osq worktree that has a
default-branch trigger by taking the default branch into its branch inline,
through rust-sync, keeping every done task, as TypeScript's
`approveDefaultBranchSteering` and `mergeDefaultBranch` in
`src/core/spec/approve-default-branch.ts` and
`approve-default-branch-merge.ts` approve one past any trigger other than
`conflict`. Unlike TypeScript, it never restarts the branch: a `conflict`
trigger takes the same path, and a conflict the merge finds is handled as
"Conflict reopen" says (326 post-mortem rule). Retiring the triggers stays
rust-retry "Approval reaction"'s, when the command's events are delivered
(ADR 030). With `<worktree>` the worktree's root, `<rel>` the change
folder's path relative to it, `<default>` the default branch, taken from a
`GitVcs` at the root as "Approval refusals with git on" takes it, and every
git step through a `GitVcs` at `<worktree>` with the config's `timeouts`,
after "Approve validation" passes `approve` SHALL, in this order:

1. fail with `vcs.author is required when vcs.enabled is true` when
   `vcs.author` is unset;
2. read `status` at `<worktree>`; when an entry's `path`, or its `from`,
   is `<rel>` or starts with `<rel>/`, commit `<rel>` with the message
   `osq: <id> replanned` and the author `vcs.author`, and record `commit`
   for `<worktree>`, so the branch keeps the plan it is leaving; with no
   such entry, write no commit;
3. for an archived change, move the folder from
   `openspec/changes/archive/<folder>` to `openspec/changes/<folder>` in
   `<worktree>`, creating the folder it needs;
4. for each capability folder directly under `<worktree>`'s
   `openspec/specs/` and each capability the change folder has a delta
   for, in byte order and once each, write `<default>`'s
   `openspec/specs/<capability>/spec.md`, read with rust-vcs `show`, or
   remove that file when `<default>` has none, leaving a capability alone
   when `<default>` has none and the file does not exist, and stage every
   path this writes or removes;
5. write the root's HEAD commit, or nothing when it has none, and a newline
   to the folder's `.run/requirements-base`;
6. write `<seal>`, rust-storage `change_folder_seal` of the folder, and a
   newline to `.run/approved`;
7. append to `.run/events/change.jsonl`, creating the folders it needs, one
   rust-core `approved` event line with the time now as
   `YYYY-MM-DDTHH:MM:SS.mmmZ` in UTC, the `hash` `<seal>` and the `targets`
   of its triggers, in order, each `change` or the task's id;
8. stage `openspec/changes/<folder>`, and for an archived change its old
   path too, commit the index with the message `osq: <id> approved` and the
   author `vcs.author`, and record `commit` for `<worktree>`;
9. run rust-sync `sync_change` with a `SyncRequest` for `<worktree>`, the
   folder, `SyncKind::Active`, `<default>`, the config's `vcs`, `timeouts`
   and `limits`, and `SyncOptions { records: false, verify: false, tasks: None }`.
   `AlreadySynced` goes on to step 10. `Synced` records `commit` for
   `<worktree>`. A `sync_conflict` stop goes to "Conflict reopen", which
   then goes on to step 10. Any other stop is recorded as an approval stop
   and fails `approve` with its message;
10. for each `.run/done/<n>` whose name is a task id and whose
    `tasks/<n>.md` reads, with `<recorded>` the marker's `scope_hash` as
    rust-storage `read_done_scope` reads it and `<current>` rust-storage
    `task_scope_hash` of `<worktree>` and the task's scope, rewrite the
    marker with rust-storage `refresh_done_marker` and the time now when
    `<current>`'s hash differs from `<recorded>`, as TypeScript's
    `refreshMergedDoneMarkers` does.

An approval stop writes `.run/regressed/change.md` as
`---\nreason: <reason>\n---\n<message>\n` and appends to
`.run/events/change.jsonl` one rust-core `regressed` event line with the
time now, the `task` `change`, the stop's reason as the `reason` and the
message as the `output`, writing no other field and committing neither
file, so rust-retry "Approval reaction" keeps the change's trigger. The
marker's `<reason>` is the stop's, except that a `sync_failed` stop keeps
the reason the marker had, since the change still needs the steering it was
approved past and approving it again retries the sync. The event's reason
is always the stop's.

A `VcsError` or a write error in steps 2 to 8 SHALL fail `approve` with its
display, leaving every write before it, so that `approve`, run again on the
change, now active and still holding its triggers, commits those writes as
`osq: <id> replanned` and goes on. `<id>` is as "Approval marker" says. The
approval writes nothing to the checkout and never writes the default
branch. Unlike TypeScript, it writes no `.run/manifest.json` and no
`.run/plan.jsonl`, and the `osq: <id> approved` commit always holds the new
`approved` line, so a second approval never finds nothing to commit.
`approve` SHALL then return as its output `Approved <id> (<folder>)`,
`  Hash: <seal>`, `  Worktree: <worktree>`, `  Branch: osq/<folder>`,
`  Merged <default> into osq/<folder>`, the `  Reopened ` line "Conflict
reopen" gives when it ran, and `  Continues from task <n>`, where `<n>` is
the first task, in task order, that has no done marker or has a regressed
marker after every write, left out when there is none, each followed by a
newline.

#### Scenario: Default-branch worktree approvals
- **WHEN** `approve` runs with the query `1`, calling the feature's `run` so no event is delivered, on a scratch repository built as `golden/print-default-branch-goldens.mjs.txt` builds the row's case, with an `osq.toml` that git ignores, whose `[vcs]` table sets `enabled = true`, `author = "Osq Bot <bot@example.com>"` and `worktreeRoot` to `<root>/worktrees`
- **THEN** it gives an `Output` whose text equals the approval lines of `tests/fixtures/default-branch-golden/<case>.txt`, each followed by a newline, with `<root>` the scratch root; its `commits:`, `branches:` and `record:` lines equal the golden's, read as the script reads them, with `<main>` `main`'s tip; and its `tree:` of the change folder's `.run/`, written as the script writes it, equals the golden's apart from the retry reaction's work, so `.run/regressed/change.md` keeps the bytes the case wrote in place of the golden's `regressed/change.1.md`, `events/change.jsonl` holds the golden's lines without its `retry` line and with one `approved` line before the `synced` line, whose `hash` is the golden's seal and whose `targets` are `change`, and the `synced` line's `duration` may be any number:

| Case |
|---|
| `merge-001` |
| `merge-noedit-001` |
| `requirement-001` |

#### Scenario: Default-branch refusals
- **WHEN** `approve` runs with the query `1` on a repository built as "Default-branch worktree approvals" builds the row's case, changed as the row says
- **THEN** it gives a `Failed` error displayed `approve failed: ` and the row's message, every `osq/` branch points where it pointed before the run, the tree record gains no line, and every file under the worktree's `openspec/changes/` keeps its bytes:

| Case | Message |
|---|---|
| `merge-001` with no `author` in `osq.toml` | `vcs.author is required when vcs.enabled is true` |
| `requirement-001` with no `.run/done/1` and with `.run/running/1.pid` holding `{"pid":999999,"startedAt":0}` | `001-alpha-twice has a task running; approve it after the task ends` |

#### Scenario: Approval stops are recorded
- **WHEN** `approve` runs with the query `1` on a repository built as "Default-branch worktree approvals" builds `requirement-001`, where `vcs.prepare` in `osq.toml` is the row's command
- **THEN** it gives a `Failed` error whose message is the stop's message rust-sync gives for that sync, `osq/001-alpha-twice`'s tip is `osq: 001 approved` with no merge in progress, `.run/regressed/change.md` holds the row's reason and that message, and `.run/events/change.jsonl` ends with the `approved` line, then one `regressed` line whose `task` is `change`, whose `reason` is the row's event reason and whose `output` is that message:

| `vcs.prepare` | Marker reason | Event reason |
|---|---|---|
| `node -e "process.exit(3)"` | `requirement_changed` | `sync_failed` |

### Requirement: Conflict reopen
When the sync of "Default-branch approval" stops with `sync_conflict`,
`approve` SHALL keep every done task the conflict does not touch and reopen
only the tasks after the first task that owns a conflicted file, rather
than restart the change. With `<paths>` the stop's `conflicts`, a task owns
a path when rust-core `scope_covers_path` gives true for its task file's
`scope` and the path, and a done task is one with a `.run/done/<n>`.

- When a path in `<paths>` is `<rel>` or lies under it, or no task owns it,
  `approve` SHALL record an approval stop, as "Default-branch approval"
  says, with the reason `sync_conflict` and the message
  `<folder>: <those paths> conflict with <default>, and no task's scope holds them; run osq plan <id> so a task owns each file, then approve the revised plan`,
  where `<those paths>` are those paths in `<paths>`'s order, joined by
  `, `, and fail with that message, leaving the branch at its
  `osq: <id> approved` commit.
- Otherwise `approve` SHALL run rust-sync `sync_change_taking_default`
  with the request of step 9 and `<paths>`, recording `commit` for
  `<worktree>` when it gives `Synced`, and recording any stop it gives as an
  approval stop and failing with its message. With `<first>` the first task
  in task order that owns a path in `<paths>`, every done task from
  `<first>` on, in task order, is reopened: its `.run/done/<n>` is renamed
  to `.run/done/<n>.<ordinal>`, where `<ordinal>` is one more than the
  highest `<k>` of any `<n>.<k>.md` in `.run/dead/` or `.run/regressed/`
  and any `<n>.<k>` in `.run/done/`, or 1, and `.run/events/<n>.jsonl`
  gains one rust-core `retry` event line with the time now, the `target`
  `<n>`, the `reason` `sync_conflict`, the `attempt` `<ordinal>` plus one
  and no `automatic` key, as rust-retry "Retry record" writes one. Every
  other done task stays done and step 10 of "Default-branch approval"
  recertifies it. The `  Reopened ` line is
  `  Reopened <reopened> (<paths> conflicted)`, followed by
  `; kept <kept>` when a done task before `<first>` stays done, where
  `<paths>` are joined by `, `, `<reopened>` names the reopened tasks and
  `<kept>` the done tasks before `<first>`, each in task order as
  `task <a>`, `tasks <a> and <b>`, or `tasks <a>, <b> and <c>` with every
  id before the last joined by `, `, and `<reopened>` is `no task` when
  none is reopened.

#### Scenario: Conflicts reopen the owning tasks
- **WHEN** `approve` runs with the query `1`, calling the feature's `run`, on a scratch repository built as `golden/print-default-branch-goldens.mjs.txt` builds `requirement-001` with `.run/regressed/change.md` holding `reason: sync_conflict`, except that the change folder also holds `tasks/2.md` and `tasks/3.md`, copies of `tasks/1.md` whose `scope` is `src/beta.js` and `src/gamma.js`, the fixture commit holds `src/beta.js` and `src/gamma.js` each with `module.exports = 1;\n`, the branch's commit writes each file the row names with `module.exports = 'branch';\n` and holds `.run/done/<n>` for each of the row's done tasks, with the scope hash rust-storage `task_scope_hash` gives on that commit, and `main moved` also writes each file the row names with `module.exports = 'main';\n`
- **THEN** it gives an `Output` whose lines are `Approved 001 (001-alpha-twice)`, `  Hash: <seal>`, `  Worktree: <root>/worktrees/repo/001-alpha-twice`, `  Branch: osq/001-alpha-twice`, `  Merged main into osq/001-alpha-twice`, the row's reopened line and, where the row gives a task, `  Continues from task <n>`; `osq/001-alpha-twice`'s tip is `osq: 001 sync main`, a merge whose second parent is `main`'s tip and whose tree holds each file the row names with `main`'s text; each reopened task's `.run/done/<n>.1` holds its old marker's bytes, `.run/done/<n>` is gone and `.run/events/<n>.jsonl` holds one `retry` line with the `target` `<n>`, the `reason` `sync_conflict` and the `attempt` 2; and every kept task's `.run/done/<n>` still exists:

| Files | Done tasks | Reopened line | Continues from |
|---|---|---|---|
| `src/beta.js` | 1, 2, 3 | `  Reopened tasks 2 and 3 (src/beta.js conflicted); kept task 1` | 2 |
| `src/gamma.js` | 1, 2, 3 | `  Reopened task 3 (src/gamma.js conflicted); kept tasks 1 and 2` | 3 |
| `src/beta.js`, `src/gamma.js` | 1, 2, 3 | `  Reopened tasks 2 and 3 (src/beta.js, src/gamma.js conflicted); kept task 1` | 2 |
| `src/alpha/index.js`, `src/gamma.js` | 1, 2, 3 | `  Reopened tasks 1, 2 and 3 (src/alpha/index.js, src/gamma.js conflicted)` | 1 |
| `src/beta.js` | 1 | `  Reopened no task (src/beta.js conflicted); kept task 1` | 2 |

#### Scenario: Conflicts no task owns stop for planning
- **WHEN** `approve` runs with the query `1` on a repository built as "Conflicts reopen the owning tasks" builds it with the done tasks 1, 2 and 3, where the branch's commit and `main moved` each write the row's file with their own text
- **THEN** it gives a `Failed` error whose message is the row's, `osq/001-alpha-twice`'s tip is `osq: 001 approved` with no merge in progress, every `.run/done/<n>` keeps its bytes, `.run/regressed/change.md` holds `reason: sync_conflict` and the row's message, and `.run/events/change.jsonl` ends with the `approved` line, then one `regressed` line whose `task` is `change`, whose `reason` is `sync_conflict` and whose `output` is the row's message:

| File | Message |
|---|---|
| `src/delta.js` | `001-alpha-twice: src/delta.js conflict with main, and no task's scope holds them; run osq plan 001 so a task owns each file, then approve the revised plan` |
| `openspec/changes/001-alpha-twice/notes.md` | `001-alpha-twice: openspec/changes/001-alpha-twice/notes.md conflict with main, and no task's scope holds them; run osq plan 001 so a task owns each file, then approve the revised plan` |
