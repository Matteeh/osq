---
queue_item: verify-log-out-of-events
queue_hash: sha256:65b185b2608859fa72ffd365724557467e18f28e91854c4360dfc518d62af3bf
planner: null
date: 2026-10-05
---

### Goal

A verify run's full output goes to its own log file, and the `verify_ran` event keeps only a short tail and a pointer to that file. Halt and regression events keep only a tail too. The event log stays small, so a dead task's patch, a change's commits, and the archive no longer grow with the size of the test suite.

### Context

As of 2026-10-05:

- `VerifyRanEventData.output` (`src/harness/types.ts`) holds the whole output of every verify run. The shared gate in `src/watcher/verify.ts` is its writer, and `src/core/vcs/sync-verify.ts` writes the sync's verify the same way. For osq itself, one `pnpm verify` prints about 3,300 tests' worth.
- The archived event logs under `openspec/changes/archive/*/.run/events/` total about 110 MB. 142's `change.jsonl` alone is 4.4 MB.
- This caused 149's `commit_failed` halt: the dead-task patch was 3.2 MB, mostly `change.jsonl` (2.1 MB), and overflowed git's 1 MiB `execFile` buffer. The buffer limit is lifted on main (`9cdbbe5`), but the bloat and its git history remain. Notion: "Why 149 halted (2026-10-05)", candidates 2 and 3.
- `regressed` and `recertification` events also carry a verify's full `output` (`src/watcher/regression.ts`, `src/watcher/auto-recertify.ts`). A halt stores its error text as `output`, and in 149 that text was the cut-off 1 MB diff, so each retry made the next patch bigger.
- Readers of the stored output include `src/watcher/archive-verify.ts` (recovers the gate's payload from the `verify_ran` line), `src/watcher/attempt.ts`, `src/core/run/scope-regression-marker.ts`, and the "see the verify_ran event in .run/events/..." pointers in `change-verify.ts` and `task-verify.ts`.
- `limits.cardOutputLines` (20) already caps the output shown on inbox cards.

### Requirements

- Every verify run writes its full output to its own log file, at a path derived from its target and run. The `verify_ran` event keeps a tail of the output, sized by a config limit, and the log's path.
- `regressed`, `recertification` and halt events keep at most a configured tail of any output or error text, never a whole diff or a whole verify log.
- Every message that points a human at a verify's output points at the log file.
- Readers that need more than the tail read the log file, and fall back to the event's `output` for events written before this change.
- Each limit comes from config.

### Non-goals

- Rewriting or shrinking existing archives.
- Changing what verify runs or how its result is judged.

### Notes for planning

- Decide in the proposal whether the full logs are committed with the change or kept out of git (ignored under `.run/`, or under the worktree root). A passing run's full output has little lasting value, and a failing run's tail is already in the event. Say what a human loses either way.
- Measure a typical change's `change.jsonl` before and after, and record both in the proposal.
- Plan after 149 lands: 149 changed `src/harness/types.ts` and `git-vcs.ts`.
