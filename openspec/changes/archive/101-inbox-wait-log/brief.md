---
queue_item: inbox-wait-log
queue_hash: sha256:305ea77349c98e5bfdb0699c174a3a28db9e8fcdd119806d9f15af0f932e2329
planner: null
date: 2026-09-27
---

### Goal

osq records how long each item waited for a human, so it shows whether reviews happen sooner without getting worse.

### Context

- `inbox-cards` opens cards. `osq inbox` runs on the reviewer's machine, and `~/.osq/` already holds derived per-user data such as `~/.osq/last-look/`.
- `src/core/report/report.ts` is allow-listed in the line budget, so new report sections go in their own module.

### Requirements

- While it runs, `osq inbox` appends to a log under `~/.osq/inbox/`, per project. For each item it records when the item appeared, when its card opened, and when it disappeared, and whether the watcher had anything runnable at each of those moments.
- An item that appeared while no inbox was running starts its waiting time when the inbox first sees it, and the log marks it that way.
- The order's age tiebreak uses the log's first-seen time when there is one.
- `osq report` shows, per kind and for a chosen period, the median and longest waiting time from appearing to disappearing, how long the watcher sat idle while the top item was a human's, and how many items were handled back to back in one session. For a period with no log, those numbers say not measured.

### Non-goals

- Streaks, and routing items to one reviewer in a team.

### Notes for planning

- Test the report from a fixture log.
