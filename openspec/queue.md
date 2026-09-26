# osq queue

The remaining work on osq itself, as an osq brief queue: the rest of stage 1 of `decisions/003-git-strategy.md`, the change that turns it on for this repository, and two fixes found along the way.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

Stage 1 so far: change 087 added the change locations resolver, and change 088 added the `vcs` config block and the git write operations on the `Vcs` port. Both have landed. Every stage-1 item runs with `vcs.enabled` off; only `enable-vcs-for-osq` turns it on.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [approve-into-worktree] Approve into a worktree

Depends on: nothing

### Goal

With `vcs.enabled`, `osq approve` gives the change its own branch and worktree, and writes nothing to the checkout. Status shows the change running in that worktree. Nothing runs worktree changes yet; `run-in-worktree` does that. With the flag off, approve behaves exactly as today.

### Context

- ADR 003 decisions 2 and 11, as revised on 2026-09-26. This is change 3 of stage 1.
- Change 087 added `src/core/status/change-locations.ts`. `changeTrees` returns one tree today and is async so it can list worktrees. Every reader of running changes goes through it.
- Change 088 added `vcs.enabled`, `vcs.author`, `vcs.worktreeRoot`, and `vcs.prepare`, and the port's `createBranch`, `worktreeAdd`, `worktreeList`, and `commit`.
- `createInvalidationHub` in `src/core/web/web-events.ts` is synchronous and falls back to one tree, because `src/core/web/web-server.ts` builds its options without resolved trees. Found in 087 task 4.

### Requirements

- Approve lints and hashes the draft in the checkout, committed or not. It cuts `osq/<folder>` from HEAD and adds a worktree at `<vcs.worktreeRoot>/<repo>/<folder>`. `vcs.worktreeRoot` defaults to `~/.osq/worktrees`, `~` expands to the home directory, and `<repo>` is the repository root's folder name.
- Approve runs `vcs.prepare` once in the new worktree when it is set. A failing prepare stops the approval with its output and removes nothing.
- Approve copies the change folder into the worktree and commits the folder with `.run/approved`, `.run/base` (the commit the branch was cut from), and `.run/approver` (`user.name <user.email>` from git config) as the branch's first commit, `osq: <id> approved`, authored by `vcs.author`.
- Approve refuses when HEAD is not on the default branch unless `--base-ok` is passed. The default branch is the branch `origin/HEAD` names when a remote exists, else `vcs.defaultBranch`, else `main`. `vcs.defaultBranch` is a new optional config key.
- Approve refuses when uncommitted changes in the checkout intersect any task's resolved scope, unless `--ignore-dirty` is passed, and names the files.
- Approve refuses when `osq/<folder>` already exists.
- Until `stacking` lands, approve refuses a change whose `depends_on` names an approved change that has not landed, and names that change.
- `changeTrees` lists the osq worktrees from `worktreeList` after the checkout, and `listChanges` reports a running change from its worktree, not from the checkout's copy.
- `osq status` shows a running change with its worktree path, and warns when the checkout's copy no longer matches the approved hash.
- `web-server.ts` resolves the trees and passes them to `createInvalidationHub`.

### Non-goals

- Running tasks in the worktree, committing task results, or the dead path.
- Stacking.
- Removing worktrees.

### Notes for planning

- Test against temporary repositories with `vcs.worktreeRoot` inside the test's temporary folder, never the real home directory.
- `src/watcher/runner.ts` has 196 lines and must stay under 200.
- The checkout's copy of the folder keeps no `.run/approved`, so decide how the resolver tells a running change's checkout copy from a draft: a worktree exists for it.

## [config-errors-fail-loudly] Config errors fail loudly

Depends on: nothing

### Goal

A broken `osq.config.ts` stops osq with a clear error instead of silently falling back to the defaults. This matters now that the `vcs` block has required fields: a mistyped `vcs.author` would otherwise turn version control off without a word.

### Context

- `loadConfig` in `src/core/foundation/config.ts` imports the config file with jiti inside a `try`, and on any error only logs when `DEBUG_OSQ` is set, then continues with an empty user config. Reported by change 086's executor.
- `defineConfig` validates blocks and throws on bad values, and a config file calls it at import time, so its errors land in that `catch`.

### Requirements

- When a config file exists but fails to import or validate, `loadConfig` throws an error naming the file and the original message.
- Every command that loads config prints that error and exits 1.
- `osq doctor`'s `config` check fails with the message, as it already does for errors it sees.
- A project with no config file still loads the defaults.

### Non-goals

- New validation rules.

### Notes for planning

- `config.ts` has 244 of 250 lines.
- Measure which existing tests rely on the silent fallback before scoping.

## [dead-path-building-blocks] Dead-path building blocks

Depends on: nothing

### Goal

osq has the pieces that put a worktree back to its last verified state after a task dies, each tested on its own against a temporary worktree. Nothing calls them yet; `run-in-worktree` wires them in.

### Context

- ADR 003 decisions 1 and 4. This is change 4 of stage 1. It comes before `run-in-worktree` so that no state with the flag on leaves a dirty worktree behind a dead task.
- Change 088 added the port's `patch`, `discard`, and `commit`.
- `discard(paths)` in `src/core/vcs/git-vcs-write.ts` runs `clean -fd -- ...paths`. With an empty list that removes every untracked file in the worktree, the change folder included. Found reviewing 088.

### Requirements

- A dead task's record is built in this order: write `.run/dead/<n>.patch` from `patch()`, then discard every changed path outside the change folder, then commit the dead record. The patch is always written before anything is discarded.
- `discard` returns without running git when given no paths.
- The dead commit has the subject `osq: <id> task <n> dead, reason <reason>` and holds `.run/dead/<n>.md`, `.run/dead/<n>.patch`, and `.run/events/<n>.jsonl`, and no code.
- For `spec_conflict`, the edits to the change folder are the human's: osq commits only `.run/` and leaves the folder edits uncommitted.
- One function builds every osq commit message: subject, a body of the task title and outcome line, and trailers `Osq-Change`, `Osq-Task`, `Osq-Model`, and `Osq-Version` taken from the task's `started` event, in the form `git interpret-trailers` reads. `run-in-worktree` reuses it for verified tasks.
- Commits are authored by `vcs.author`.

### Non-goals

- Calling any of this from the runner, the loop, or the reaper.

### Notes for planning

- Test each piece against a temporary repository with a linked worktree on an `osq/` branch, including a patch that restores a new untracked file with `git apply`.

## [run-in-worktree] Run in the worktree

Depends on: approve-into-worktree, dead-path-building-blocks

### Goal

With `vcs.enabled`, a change runs start to finish on its own branch. Each verified task is a commit, a dead task leaves a clean branch tip and a patch, the archive is the last commit, and protocol violations kill the task. With the flag off, the watcher behaves exactly as today.

### Context

- ADR 003 decisions 1, 3, 4, 8 and 11. This is change 5 of stage 1.
- Stage 0's git guard in `src/watcher/git-guard.ts` records `vcs_violation` and `scope_violation` without killing.
- AGENTS.md says new test files are always allowed, but stage 0 recorded a `scope_violation` for a new test file outside scope in 087 task 4.

### Requirements

- The watcher runs each running change with its worktree as `projectRoot`, so verify, `OSQ_CHANGE`, and the adapters work inside the worktree.
- Before every spawn the worktree is on its branch and clean outside the active change's `.run/`. Otherwise the change stops with a message naming the files.
- A verified task is committed with its scope edits, `.run/done/<n>`, `.run/results/<n>.md`, `.run/events/<n>.jsonl`, and the tick in `tasks.md`, as `osq: <id> task <n> verified`.
- The archive is committed as `osq: <id> archived`.
- A commit that fails halts the change with git's output and is not retried.
- The git guard runs against the worktree. `vcs_violation` and `scope_violation` kill the task through the dead path. A new test file outside scope is not a scope violation, because AGENTS.md allows it.
- A crash reaped by `reapStaleLocks` takes the same dead path.
- `osq watch` recreates a missing worktree for an `osq/` branch whose change is approved and has a pending task.
- `osq status` warns not to edit a worktree while a task runs in it.
- `retry`, `reject`, `done`, and `verified` write their markers where the change runs.

### Non-goals

- Stacking, sync with main, `osq land`, and concurrency.

### Notes for planning

- `src/watcher/runner.ts` has 196 lines and must stay under 200; new behaviour goes in new modules called from the loop, or through one statement.
- This is the largest stage-1 change. Split it into tasks by pipeline step, and measure test fallout in a scratch worktree first.

## [stacking] Stacking dependent changes

Depends on: run-in-worktree

### Goal

A chain of dependent changes approved at once runs without a human, as it does today. A dependent approved before its dependency lands is cut from the dependency's archive commit once that commit exists.

### Context

- ADR 003 decisions 2 and 5. This is change 6 of stage 1.
- `approve-into-worktree` makes approve refuse such a dependent; this change replaces that refusal.

### Requirements

- Approving a change whose `depends_on` names an approved change that has not landed records the approval and waits. When the dependency's archive commit exists, osq cuts the dependent's branch from it and creates its worktree.
- A dependency has landed when its archive folder exists on the default branch.
- When the dependency changes or is rejected before it lands, the dependent halts with a message saying to approve it again, and approving it again cuts it from the new base.
- With `vcs.enabled`, `osq reject` removes the change's worktree when it is clean and keeps its branch.

### Non-goals

- Syncing a dependent after its dependency lands. That is stage 2.

### Notes for planning

- Checking whether a path exists at a ref needs a new read on the `Vcs` port. Add it as a read, and keep the port's never-list test passing.

## [osq-message-and-leftovers] osq message, leftover drafts, and traceability through files

Depends on: stacking

### Goal

A change landed by hand keeps its trailers, a leftover draft after a hand landing is flagged, and tests run by hand in a worktree find their change. This completes stage 1.

### Context

- ADR 003 decisions 1, 2, 7 and 11. This is change 7 of stage 1.
- A hand-run `git merge --squash osq/<folder>` does not refuse over the untracked leftover draft, because the branch only adds the archive folder. Tested on 2026-09-26.

### Requirements

- `osq message <id>` prints the squash commit message and writes nothing. Its subject is `osq: <id> <folder words>`, its body is the proposal's `## Goal` and one outcome line per task, and its trailer block holds `Osq-Change`, `Osq-Base`, `Osq-Head`, `Osq-Approved`, `Osq-Approved-By`, and `Osq-Model` once per model used. It also prints the branch to squash.
- For a stacked change whose dependency has not landed, `osq message` names the dependency to land first.
- After a change lands, `osq status` flags a checkout copy of its draft whose hash matches the approved hash, and prints the command that removes it.
- The traceability helper, when `OSQ_CHANGE` is unset inside an osq worktree, finds the change from the branch `osq/<folder>` by reading the worktree's `.git` file and `HEAD` file, never by spawning git.
- README.md's "Not yet" drops the worktree and `scope_violation` entries and keeps the sandbox for enforcement.

### Non-goals

- `osq land`. That is stage 2.

### Notes for planning

- The traceability helper ships in `@matteeh/osq/testing` and runs inside every test process, so it must stay cheap.

## [enable-vcs-for-osq] Turn on version control for osq itself

Depends on: osq-message-and-leftovers

### Goal

osq's own changes run in worktrees on `osq/` branches from here on. This is the first change after stage 1, and the first real test of it.

### Context

- ADR 003 migration: every stage-1 change ran with the flag off; the flag turns on for the change after the stage.
- Approve refuses off the default branch without `--base-ok`, so approvals from here on happen on `main`.

### Requirements

- `osq.config.ts` sets `vcs.enabled: true`, `vcs.author`, and `vcs.prepare: 'pnpm install --frozen-lockfile'`.
- README.md documents the stage-1 flow: approve on the default branch, where the worktree is, not editing it while a task runs, and landing by hand with `osq message`.

### Non-goals

- Any code change.

### Notes for planning

- Ask the human which identity `vcs.author` should use.
- `osq doctor` should show no `vcs-prepare` warning afterwards.

## [opencode-v2-adapter] Check the opencode adapter against opencode v2

Depends on: nothing

### Goal

osq knows whether its opencode adapter works with opencode v2, and either works with it or says clearly that it does not.

### Context

- The human upgraded to opencode v2, and this repository switched to the pi harness on 2026-09-26. `OSQ_HARNESS=opencode` still selects the opencode adapter, which was written and tested against opencode v1.

### Requirements

- Doctor's harness check reports whether the installed opencode version is inside the adapter's tested range.
- The adapter's argument list, event stream translation, and agent file setup work with opencode v2, or doctor fails with a message naming the unsupported version.

### Non-goals

- Changing this repository's default harness back.

### Notes for planning

- Record the opencode v2 CLI flags and stream format actually observed before planning tasks.
