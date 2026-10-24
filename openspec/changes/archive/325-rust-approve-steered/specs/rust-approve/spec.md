## MODIFIED Requirements

### Requirement: Approve lookup
`approve` SHALL approve the first active change folder whose name matches
the query as TypeScript's `matchesFolder` in
`src/core/status/change-locations.ts` matches it: with `trimmed` the query
without surrounding whitespace, and `padded` the value of `trimmed`'s
leading ASCII digits padded with zeros to three digits when `trimmed`
starts with one, or else `trimmed`, a folder matches when its name equals
`trimmed` or `padded`, or starts with `trimmed` followed by `-` or `padded`
followed by `-`. With git off, as "Worktree approval" says, the folders are
rust-storage `list_changes` of the root, in its order. With git on, they are
the active entries of rust-storage `list_tree_changes` over `change_trees`
for the root, built from the `worktree_list` of a `GitVcs` at the root with
the config's `timeouts` and no stacked folders, in that order, so a change
approved into its osq worktree is found there, as TypeScript's
`findSteeringChange` finds it; a failing worktree listing SHALL fail with
the `VcsError`'s display. With no match, `approve` SHALL fail with
`Spec "<query>" not found in <changes>`, where `<query>` is the argument as
given and `<changes>` is the root joined with `openspec/changes`, shown with
`display()`. Archived and rejected folders never match, so unlike
TypeScript, an archived change that needs steering is not found.

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
| `012-beta-two` | `012-beta` |
| `x` | `x-y` |
| `x-y` | `x-y` |
| `3` | `Spec "3" not found in <changes>` |
| `alpha` | `Spec "alpha" not found in <changes>` |

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
- a default-branch trigger, with
  `Change <folder> needs steering: <triggers>. Rust approve does not approve default-branch steering yet.`;
- with git on, a change in the root's own tree, with
  `Change <folder> needs steering: <triggers>. Rust approve steers a change with git on only in its worktree.`,

where `<triggers>` are every trigger shown, joined by `, `. Every other
change with triggers is approved as "Steered approval" says. A change in an
osq worktree with no triggers goes on to the checks the other approve
requirements name.

#### Scenario: Steering triggers
- **WHEN** `approve` runs with the query `1`, with git off, on a root whose one active change folder `001-a` is a valid change folder holding `tasks/1.md` and `tasks/2.md`, with the row's files under `.run/`, each marker's frontmatter written as the row gives it, calling the feature's `run`, so no event is delivered
- **THEN** it gives the row's `Failed` message and every file under `.run/` keeps its bytes; or, where the row says approved, it gives the `Output` `Approved 001 (001-a)\n  Hash: <seal>\n`, `.run/approved` holds the folder's seal and a newline, and no `.run/events/change.jsonl` is written; or, where the row says steered, it gives that `Output` followed by `  Continues from task <n>\n` for the row's task, `.run/approved` holds the seal and a newline, `.run/events/change.jsonl` holds one `approved` line whose `hash` is the seal and whose `targets` are the row's, and every other file under `.run/` keeps its bytes:

| Files under `.run/` | Result |
|---|---|
| `approved`, `regressed/change.md` with `reason: sync_conflict` | `Change 001-a needs steering: change conflict (sync_conflict). Rust approve does not approve default-branch steering yet.` |
| `approved`, `regressed/change.md` with `reason: requirement_changed` | `Change 001-a needs steering: change requirement_changed (requirement_changed). Rust approve does not approve default-branch steering yet.` |
| `approved`, `regressed/change.md` with `reason: sync_verify_red` | `Change 001-a needs steering: change regression (sync_verify_red). Rust approve does not approve default-branch steering yet.` |
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

## ADDED Requirements

### Requirement: Steered approval
`approve` SHALL approve a change with triggers that "Steering refusal" does
not refuse as TypeScript's `approveSteeredChange` in
`src/core/spec/approve-steer.ts` approves one in its worktree, and as its
`approveSpec` in `src/core/spec/approve.ts` approves one in place with git
off, keeping every done task. After "Approve validation" passes, which
validates the change's folder against the root's living specs, and with
`<seal>` the seal rust-storage `change_folder_seal` gives for that folder,
`approve` SHALL, in this order:

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
| `blocked-001` with `.run/regressed/change.md` holding `reason: sync_conflict` instead of its dead marker | `Change 001-alpha-twice needs steering: change conflict (sync_conflict). Rust approve does not approve default-branch steering yet.` |
| `blocked-001` with its markers written in the checkout's folder, which is not moved, and no worktree | `Change 001-alpha-twice needs steering: task 1 blocked (blocked). Rust approve steers a change with git on only in its worktree.` |
| `blocked-001` with no `author` in `osq.toml` | `vcs.author is required when vcs.enabled is true` |
