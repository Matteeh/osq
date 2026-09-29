---
title: osq sync and the watcher keep a change's branch current with main
depends_on: ["109"]
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
---
## Goal

A change's branch takes in the default branch before its first task, before
archive, and when a human runs `osq sync <id>`. The agent then starts from
current code, archive merges the deltas into current living specs, and
`osq land` rarely meets a conflict.

`syncWithDefaultBranch` from change 107 learns to sync an active change as
well as an archived one. It also learns to take a landed dependency's archive
from the default branch, so a stacked dependent can sync once its dependency
lands. The watcher calls it at the two points ADR 003 decision 5 names and
halts the change when it stops. `osq status` shows each change's last sync.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The sync is tested on real
temporary repositories through `syncWithDefaultBranch`. That includes a
stacked dependent whose dependency landed through `osq land`. The watcher's
syncs are tested through `runWatcherOnce` on changes approved into worktrees,
`osq sync` through `syncCommand`, and the status line through
`getStatusOverview` and `formatStatusOverview`.

## Non-goals

- Mode B, fetching, or pushing.
- Resolving a conflict outside the living specs and the archive directory.
- Syncing between tasks. The watcher syncs only before the first task and
  before archive. `osq sync <id>` covers the rest.
- A halt marker from `osq sync`. It records a `sync_stopped` event instead,
  which `osq status` shows, and the watcher's next sync hits the same stop and
  halts the change.
- Recording a stopped `osq land`. `osq land` refuses a worktree with any
  uncommitted file, so an event left there would block the next land.
- Syncing a stacked dependent before its dependency lands.
- Showing the last sync in `osq inbox`, `osq show`, or the dashboard.

## Surface

- Added: `osq sync <id>` (command)
- Added: `Synced osq/<folder> with <default branch>` and `osq/<folder> already has <default branch>` (`osq sync` output)
- Added: `osq sync needs vcs.enabled and git`, `No change "<id>" runs in an osq worktree`, `<folder> has a task running; run osq sync <id> after it ends`, `<folder> is stacked on <folders>, which has not landed; land it first`, and `<worktree> has uncommitted changes: <paths>; commit or discard them first` (`osq sync` refusals)
- Added: `sync_conflict` and `sync_failed` (halt reasons in `.run/regressed/change.md`)
- Added: `  last sync: <timestamp>, <n> commits from <default branch>` (`osq status` line)
- Added: `sync_stopped` (event type, in an active change's `.run/events/change.jsonl`, written by `osq sync`)
- Added: `  sync stopped: <timestamp> (<reason>); run osq sync <id> again once it is fixed` and the stop's first line (`osq status` lines)
- Added: `lastSyncStop` in each `worktrees` entry of the status overview
- Added: `lastSync` in each `worktrees` entry of the status overview
- Changed: the watcher commits `osq: <id> sync <default branch>` on a change's branch before its first task and before archive, when the default branch has moved
- Changed: `synced` and `verify_ran` events also go to an active change's `.run/events/change.jsonl`, and a `verify_ran` for a task's `verify` carries `task`
- Added: ` and re-running verify for tasks <n>, ...` (sync progress line for an active change)
- Added: `<folder>: verify of task <n> failed on osq/<folder> merged with <default branch>:` (sync stop)
- Changed: a sync conflict stop for an active change ends `then run osq retry <id> change`
- Changed: every sync, `osq land`'s included, resolves conflicts in any living spec and under the archive directory from the default branch
- Changed: README's version control section describes the watcher's syncs and `osq sync`

## Decisions

- ADR 001: `osq sync` loads `osq.config.ts` through `loadConfig`, inside its error handling, as `osq land` does.
- ADR 002: the sync still merges deltas with `applyOpenSpecDeltas`, without a model, and only for an archived change. An active change keeps the default branch's living specs until archive merges its deltas.
- ADR 004: unchanged; nothing here runs the OpenSpec validator.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

**What conflicts when a stacked dependent syncs.** Measured on 2026-09-29 in a
scratch repository with git 2.34.1. `002` was cut from `001`'s archive
commit. `main` then moved, `001` synced (appending to its archived
`.run/events/change.jsonl`), and `001` landed as one commit built from its
tip's tree. Merging `main` into `002` then conflicted in exactly one path:
add/add in `001`'s archived `change.jsonl`. `main` holds the squash, not
`001`'s commits, so git sees both sides adding `001`'s archive folder. `main`'s
copy is the landed one, so the sync takes it. A living spec that `001`'s land
rebuilt can conflict the same way. The sync already never keeps git's merge of
a living spec.

**Why every living spec, not only the delta's capabilities.** An active change
has not written any living spec, so its branch should hold the default
branch's copies. An archived change's branch should hold the default branch's
copies plus its own deltas, which is what archive would have produced against
current `main`. Setting every living spec to the default branch's copy, then
applying the deltas only for an archived change, gives both. It also
covers a stacked dependent whose dependency's archive changed a spec that
the dependent's deltas never touch.

**Which verify a sync runs.** For an archived change the sync keeps running
the proposal's `verify`, since archive verified that tree with it and
`osq land` relies on it. For an active change, ADR 003 decision 5 applies:
re-run the `verify` of every task already done. Before the first task no
task is done, so that sync runs no `verify`. Before archive, the task
verifies are focused and cheap, and archive runs the proposal's `verify` on
the merged tree right after.

**Stacked dependents.** While `awaitedDependencies` lists any entry, the
watcher skips both syncs and `osq sync` refuses. The dependent's branch holds
its dependency's archive, and taking `main`'s living specs would drop them.
`osq message` already refuses to land such a change for the same reason.
Once the dependency lands, the next sync, before archive or by `osq sync`,
takes it in.

**Stops are on record.** The watcher's halt already records a stop as a
`regressed` event and marker. `osq sync` halts nothing, so it records its own
stop for an active change as a `sync_stopped` event, left uncommitted under
`.run/`, which the watcher allows. A later successful sync hides it in
`osq status`. Every abort also writes `.run/events/change.jsonl` back as it
was before the sync. Otherwise `git merge --abort` would reset the file the
sync staged, dropping lines that were not committed yet.

**Measured fallout.** A rough version of all four tasks ran the full suite
and the CLI typecheck in a scratch worktree. Only the function budget failed,
on the prototype's longer `syncWithDefaultBranch`. The failures that need a
build are the same as in the baseline run. No preexisting test pins the
changed behaviour: no worktree test moves `main` during a run, the status
line only prints after a `synced` event, and the README tests pass with the
new paragraph.

## Contract

### Requirement: The branch follows the default branch at fixed points
The watcher SHALL take the default branch into a change's branch before the
change's first task and before its archive, and `osq sync <id>` SHALL do so
on request. Each sync SHALL either commit `osq: <id> sync <default branch>` or
leave the branch where it was.

#### Scenario: Main moved while a change waited
- **WHEN** a commit lands on the default branch after a change is approved and before its first task spawns
- **THEN** the task runs in a worktree whose HEAD is `osq: <id> sync main` and whose tree holds that commit's files

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: modifies "Default branch sync"; adds "Sync on request".
- `specs/watcher-and-harness/spec.md`: adds "Watcher sync".
- `specs/cli-foundation/spec.md`: adds "Sync command".
- `specs/status-inspection/spec.md`: adds "Last sync in status".

Four tasks. Task 1 extends the sync to active changes and landed
dependencies. Task 2 calls it from the watcher. Task 3 adds `osq sync` and the
README paragraph. Task 4 shows the last sync, and a later stopped one, in `osq status`.

No file is shared between tasks.
