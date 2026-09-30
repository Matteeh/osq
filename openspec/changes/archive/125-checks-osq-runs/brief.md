---
queue_item: checks-osq-runs
queue_hash: sha256:d32c9b64bac9386022ddba186d60e2b3a048d89c86a7f0239387e40927baefef
planner: null
date: 2026-09-30
---

### Goal

osq never records a human's claim as verification (ADR 006 decision 3). A proposal's `check:` command runs as part of landing, and its result is what's recorded. "After landing" steps become notes that nothing waits on. `osq verified` goes, and so does the verification-pending state that holds dependents back.

### Context

As of 2026-09-28:

- A proposal with `### After landing` steps or a `check: <command>` in its frontmatter archives as verification pending (`readArchivedVerification` in `src/watcher/archiver.ts`). Its dependents wait, and the queue shows it as `verification-pending`, until a human runs `osq verified <id> --passed` or `--failed`. `osq check <id>` runs the recorded command.
- The state runs through `src/core/status/`: `state.ts`, `dependency-readiness.ts`, `queue-state.ts`, `next-step.ts`, `inbox.ts`, `inbox-projection.ts`, `inbox-text.ts` and `queue-report-detail.ts`. The inbox has a verification item with `p` and `f` keys.
- PLANNER.md and `templates/PLANNER.md` tell planners that after-landing steps keep verification pending until `osq verified`.
- Across 107 archived changes, a verification was recorded twice.
- Approval flags print and then approve anyway, unless `--confirm` is passed (README, "Gates and permissions"). ADR 006 decision 4 says a gate blocks or goes.

### Requirements

- osq runs the proposal's `check:` command as part of `osq land` and records its result in the change's events.
- `### After landing` steps are shown at land and in `osq show` as notes. Nothing waits on them.
- `osq verified`, the verification-pending state, the inbox's verification items and their keys, and the queue's `verification-pending` state are removed. Archives holding a recorded verification still read.
- PLANNER.md and its template describe the new rule.

### Decide before planning

- Where the check runs: in the worktree before the fast-forward, like verify, or in the checkout after it. A server has no checkout.
- Whether a failed check stops the land or blocks dependents, as a failed gate should, and how a human clears it.
- Approval flags: count how often each flag fired across the archive by recomputing each archived change's digest. Then make the ones that caught something real lint errors and drop the rest. That may be a change of its own.

### Non-goals

- Human steps before approval. They stay.

### Notes for planning

- Expect REMOVED requirements in status-inspection and cli-foundation. Measure the fallout first.
- Removing a command needs a CHANGELOG note.
