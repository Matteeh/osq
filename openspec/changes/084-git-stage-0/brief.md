---
planner: null
date: 2026-09-26
---

# Git, stage 0: read-only

Revised on 2026-09-26 against decisions/003-git-strategy.md and a read of main at 8b53ca1.

## Goal

osq reads git state, records a task whose agent ran git, and records edits outside a task's scope, without writing anything to git and without killing any task for a git reason. It also stops writing absolute machine paths into events and markers, because stage 1 commits `.run/` to a branch. Projects outside git get only the path change.

## Context

- osq runs git only in `src/watcher/build-project.ts`, for `rev-parse --short HEAD` and `rev-parse --show-toplevel`.
- Executors run with unrestricted bash, and nothing tells them not to run git. `git stash` leaves HEAD where it was.
- The watcher still runs in the checkout the human edits and uses git in. Anything stage 0 detects there can also be the human's doing, so stage 0 records and warns; stage 1 kills.
- Scope compliance is checked only for `tests/**`, through `captureTestGate` in `src/watcher/verify.ts`. Repo-wide scope detection has not landed; `git status` is the snapshot.
- Tool summaries are already relativized at write time by every adapter through `relativizeToolSummary`. The `started` event already carries `harness`, `model`, `osqVersion` and `projectCommit`. Neither needs work.
- Absolute paths still reach archived events in two places: verify output in `verify_ran` events (pnpm prints `> osq@… verify /home/…`), and the `archived` event's `archivePath` in `change.jsonl`. Verify output copied into dead and regressed markers carries the same paths.
- `decisions/003-git-strategy.md` is accepted with `applies_to: all`. It is the first all-scoped ADR, so AGENTS.md gains its first `OSQ:RULES` block through `osq init`.

## Requirements

- A new capability, `version-control`, owns `src/core/vcs/`. It holds a `Vcs` port with only the read operations this stage uses: root, head with its commit and the branch it points to (null when detached), an index digest (a hash of `ls-files --stage`), the stash list with the branch each entry was made on, and status with untracked files included and ignored files excluded. `GitVcs` spawns the git binary with a fixed working directory and removes `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE` from the child environment. `NoVcs` returns empty results and says git is unavailable. Timeouts come from config.
- `src/core/` and `src/watcher/` depend on the `Vcs` port only; the CLI and watcher wiring choose `GitVcs` when git is available and the project is a repository, else `NoVcs`.
- Doctor reports whether git is available, whether the project is a repository, and warns when `GIT_DIR`, `GIT_INDEX_FILE` or `GIT_WORK_TREE` is set in osq's own environment.
- The executor prompt says agents never run git.
- Before spawn and after the agent exits (before verify), the runner records HEAD's commit and branch, the index digest and the stash list. Any difference appends a `vcs_violation` event with the values before and after, and prints a warning that says what moved, how to put it back, and that a human using git in this checkout during the task causes the same result. The task is not killed and its outcome is unchanged.
- Under `GitVcs`, before spawn the runner hashes every file `git status` lists. After the agent exits, before verify, a file is changed during the task when its status or content hash differs from before spawn. A changed file outside the task's resolved scope, outside the change folder and outside ignored paths appends a `scope_violation` event naming the files, and prints a warning. The task is not killed. Under `NoVcs`, scope checks stay as they are today.
- Verify output is relativized to the project root before it is written to a `verify_ran` event or a dead or regressed marker. The `archived` event records `archivePath` relative to the project root. Events stay append-only; existing events and archives are not rewritten.

## Non-goals

- Any git write: no branches, worktrees, commits, discards or index changes.
- Changing where the watcher runs.
- Killing a task for `vcs_violation` or `scope_violation`. That is stage 1.
- `Vcs` operations later stages need, such as diff, isAncestor, log and merge.
- A budget on all-scoped ADR rules.

## Notes for planning

Test `GitVcs` against temporary repositories created inside each test, and `NoVcs` against the existing fixture. Cover:

- a commit, a stash, a checkout of another branch and a staged file each record `vcs_violation` with before and after values, and the task still lands
- a file changed outside scope records `scope_violation`, and the task still lands
- a file dirty before spawn and untouched by the agent is not a scope violation; one dirty before spawn and then edited by the agent is
- `GIT_DIR` set in the environment does not redirect `GitVcs`, and doctor warns about it
- verify output and `archivePath` with absolute paths are written relative to the project root
- outside git, no git event is recorded and doctor reports git absent
