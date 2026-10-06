---
queue_item: halt-self-recovery
queue_hash: sha256:c083ac5a8ed434729ff7b36d1869556da1123026cc19fe9bea0aeb9f5f333cbf
planner: null
date: 2026-10-06
---

### Goal

A dead task whose record failed to commit, and a done task flagged only because main was merged in, recover on their own, so a human never runs git in a worktree. `osq approve` works, or refuses clearly, when run from inside a worktree. These are the remaining fixes from 149's halt.

### Context

As of 2026-10-05 (Notion: "Why 149 halted (2026-10-05)", candidates 1, 4, 5, 7 and 8):

- `commitWorktreeDeadTask` (`src/watcher/worktree-commit.ts`) calls `commitDeadTask` (`src/core/run/dead-commit.ts`), which writes `.run/dead/<n>.patch`, discards the agent's edits outside the change folder, and commits. If anything throws, the change halts with `commit_failed`, and nothing retries it: `commitPendingVerifiedTasks` catches up on done markers only. `osq retry <id> change` would then halt again with `worktree_dirty`. In 149 the human ran `git add -N`, `diff`, `checkout` and `rm` by hand, which ADR 006 rules out.
- When the watcher merges main into a change branch and the merge changes a file a done task owns, the scope audit flags `scope_regression`, and the attribution comes out as `unknown` (`src/core/run/scope-hash.ts`). `autoRecertify` (`src/watcher/auto-recertify.ts`) passes only when a later task of the same change carried the path. In 149, hotfix `9cdbbe5` changed `git-vcs.ts`, which task 3 owns, so the change halted after all seven tasks were done, and `osq status` suggested `osq plan 149`. `osq retry 149 3` fixed it.
- Commands take `process.cwd()` as the project root (`resolveInputs` in `src/cli/command-inputs.ts`). `osq approve 149` run inside its worktree under `~/.osq/worktrees` linted the worktree's copy, where done tasks had already created their tests, and failed with "scope touches existing test files without tests.modify". From the checkout it passed.
- The approval flag for a shared file says the watcher "will halt for recertification", but it re-checks the owner by itself when its verify passes (149 tasks 1 and 2: `outcome: passed`, `automatic: true`).
- The hotfix `9cdbbe5` (`maxBuffer: Number.POSITIVE_INFINITY` in `runGit`, test `tests/git-output-buffer.test.ts`) has no requirement in a living spec.

### Requirements

- The watcher catches up on a dead task whose commit failed, as it does for pending done markers, before the clean-tree check. When the catch-up succeeds, the `commit_failed` halt clears with an event, and the change continues as it would have after the death.
- After a sync merges main into a change branch, a done task whose owned files changed only through that merge is re-checked automatically when its verify passes, recorded as automatic and attributed to the sync. When its verify fails, the change halts as today, attributed to the sync instead of `unknown`, and the next step names that sync.
- `osq approve` run from inside an osq worktree either acts on the main checkout or refuses with one line that names the checkout to run it from. It never lints the worktree's copy as if it were the draft.
- The shared-file approval flag says what the watcher really does.
- A version-control requirement says git output has no size limit, with `tests/git-output-buffer.test.ts` as its test.

### Non-goals

- Changing what counts as a scope regression for edits made outside a sync.
- Retrying a failed dead commit forever: a commit that keeps failing still halts, with the reason.

### Notes for planning

- Decide in the proposal whether approve resolves to the checkout or refuses. Resolving is nicer if every write approve makes can safely target the checkout from a worktree; check `approve-worktree.ts` first.
- Say how many catch-up attempts a failed dead commit gets before it halts for good, from config.
- Plan after 149 lands; it changed `git-vcs.ts`.
