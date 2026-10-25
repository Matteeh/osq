---
title: Rust osq approve re-approves a change steered by a default-branch trigger
depends_on: ["345"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage, rust-vcs, rust-config, rust-specs, rust-loop]
---
## Goal

A change also needs steering when the default branch moves under it: a
sync conflict, a requirement main rewrote, or a red verify after a sync.
Most of these stops come from `osq land`, on an archived change. Rust
approve refuses every one of them today. TypeScript's approve merges main
and keeps the done tasks, except after a conflict, where it restarts the
whole branch from main and every task runs again. 326 lost a complete
two-hour run that way, so the post-mortem rule is: never restart without
first trying to merge or rerun only the affected tasks.

This change lets Rust approve handle every default-branch trigger without
a restart. Approve merges the default branch inline through the sync
kernel 345 created, keeps the done tasks and recertifies them on the
merged tree, as TypeScript's merge path does. When the merge conflicts,
approve takes the default branch's version of each conflicted file,
commits the merge, and reopens only the done tasks from the first task
that owns a conflicted file onwards. A conflict in the plan, or in a file
no task owns, stops the change for planning instead. This is Rust-first
for `conflict-reruns-owning-tasks`: TypeScript keeps its restart until
that queue item ports this rule.

The first plan of this item, 343, ported TypeScript's restart and merged
through a land reaction. It was held so the merge runs inline. Its golden
script, the merge goldens, the archived lookup and retry's later-failure
guard carry over.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, every Rust test with the corpus tests, and the mutation check on the
lines this change touches.

- The sync kernel's `default_branch_resolution` test resolves listed
  conflicts to the default branch and still stops on the others.
- Retry's `retry_reaction_later` test keeps a failure recorded after the
  approval.
- Approve's `approve_default_branch` test compares the merge path's
  output, commits, branches, tree record and `.run/` tree with goldens
  printed by TypeScript's built `dist`, and checks the recorded stops.
  `approve_conflict_reopen` checks the reopen and planning-stop rules,
  which TypeScript lacks, against the spec's tables.
  `approve_archived_lookup` checks the archived lookup and its refusal.
- The CLI's `approve_default_branch` test runs `osq approve` through
  `run_cli` with every reaction delivered, compares the merge path with
  TypeScript's goldens, and proves that a conflict's trigger is cleared
  while a planning stop's trigger is kept.

## Non-goals

- Stacked changes, and anything that stacks on a chain tip.
- Auto-steer.
- A merge agent.
- TypeScript's restart, and the land conflict message that still promises
  one; `conflict-reruns-owning-tasks` changes both.
- The TypeScript refusal while a planner runs, the digest, notices,
  `.run/manifest.json` and `.run/plan.jsonl`, as in 325.

## Surface

- Changed: `osq approve <id>` (Rust) approves a change in its worktree that
  has a default-branch trigger. It merges the default branch inline and
  prints `  Merged <default branch> into osq/<folder>`, as TypeScript does.
  The refusal "Rust approve does not approve default-branch steering yet"
  is removed.
- Added: on a merge conflict, `osq approve <id>` (Rust) reopens the owning
  done tasks and the done tasks after them, and prints
  `  Reopened <tasks> (<paths> conflicted); kept <tasks>`. A reopened
  task's `.run/done/<n>` is kept as `.run/done/<n>.<k>`, and a `retry`
  event with the reason `sync_conflict` is added.
- Added: a conflict in the plan, or in a file no task owns, fails approve
  with `<folder>: <paths> conflict with <default branch>, and no task's scope holds them; run osq plan <id> so a task owns each file, then approve the revised plan`.
- Added: a sync that stops after the approval commit writes
  `.run/regressed/change.md` and a `regressed` event, which retry's
  reaction now keeps.
- Changed: `osq approve <id>` (Rust) also finds an archived change that
  needs steering in its osq worktree. A new refusal covers an archived
  change with run triggers only.
- Added: `sync_change_taking_default` in `osq-kernel-sync`.

## Decisions

- ADR 022: approve calls the sync kernel and never another feature; retry still clears the triggers by reacting to the `approved` event.
- ADR 023: the approval, the stop record, the conflict sort and the reopen are small named functions; only their orchestrators do IO.
- ADR 024: every changed public item names its requirement and every new test its scenario.
- ADR 025: markers, commits, branch names, events and the tree record are TypeScript's; `.run/done/<n>.<k>` follows retry's retained-marker names.
- ADR 026: approve validates the change folder in the specs kernel against the checkout's living specs, archived or active.
- ADR 027: five tasks, each in one crate; the two approve tasks share the crate and run in order after the sync kernel task.
- ADR 028: no feature gains a command or a reaction.
- ADR 029: approve reads `vcs.enabled`, `vcs.author`, `vcs.prepare`, `vcs.defaultBranch`, the git timeouts and the limits from `osq.toml` through the config kernel.
- ADR 030: approve's sync runs inside its own command, because its result decides the output; retry's guard keeps any failure recorded after the approval, so a delivery after a failed approve never clears it.

## Assumptions

- A task owns a conflicted file when its task file's `scope` covers it, done or not. The brief says "a file no done task owns" stops for planning; counting pending tasks too means a planner can fix a planning stop by giving the file to a task, new or existing, and the next approve reopens from there.
- Kept done tasks are recertified as TypeScript's merge path does, by refreshing a done marker whose scope hash changed, without running their verify. The reopened tasks run again, and the watcher's change verify runs after each one.
- A `sync_failed` stop after the approval keeps the marker's old reason, so the change still shows the steering it needs and approving again retries the sync. The `regressed` event names `sync_failed`.
- Approve's stop record is uncommitted, as the watcher's markers in an active change are, so it never adds a commit after `osq: <id> approved`.
- `Merged <default> into osq/<folder>` is printed when the default branch was already merged too, as TypeScript prints it.
- The goldens printed again on 2026-10-25 from `dist` equal 343's, apart from the `synced` event's `duration`, which tests accept as any number.

## Contract

### Requirement: Default-branch approval

See `specs/rust-approve/spec.md`.

### Requirement: Conflict reopen

See `specs/rust-approve/spec.md`.

### Requirement: Default-branch resolution

See `specs/rust-sync/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-sync/spec.md`: ADDED "Default-branch resolution".
- `specs/rust-retry/spec.md`: MODIFIED "Approval reaction", adding the later-failure guard and the scenario "Failures recorded after the approval are kept".
- `specs/rust-approve/spec.md`: MODIFIED "Approve lookup", "Steering refusal" and "Steered approval"; ADDED "Default-branch approval" and "Conflict reopen".
- `specs/rust-cli/spec.md`: ADDED "Default-branch approval through the CLI".
- `golden/print-default-branch-goldens.mjs.txt` printed the four goldens beside it from TypeScript's `dist`. Copy it to a `.mjs` file before running it.
- Shared files: tasks 3 and 4 both write under `crates/features/approve/src/**`; task 4 extends `approve.rs`, `text.rs` and the default-branch module task 3 creates.
