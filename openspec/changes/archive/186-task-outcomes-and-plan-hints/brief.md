---
queue_item: task-outcomes-and-plan-hints
queue_hash: sha256:fbb974e52205cddb2ccb3cebc1f9cae2f28d0f41fa9f259f35f50b90ea205908
planner: null
date: 2026-10-13
---

### Goal

The planner learns which task shapes succeed and which fail in this project, from data osq already has. `osq query` gets a `task_outcomes` table joining what the plan decided with what happened, and the plan prompt gets a short, counted hints section, so the lesson reaches the planner without it having to think of running a query.

### Context

As of 2026-10-12:

- `osq query` builds its tables in `src/core/report/query-tables.ts`. `tasks` has only `change, task, title, attempts, done`; `dead_attempts` has `change, task, reason`.
- `taskScopeSize` in `src/core/report/scope-size.ts` already sizes a task's scope.
- The plan prompt quotes recent executor disclosures, bounded by `planning.disclosures.recentChanges` and `planning.disclosures.maxCharacters` (`src/core/foundation/config-planning.ts`, `src/core/report/recent-disclosures.ts`).
- Notion page "Learning from history: task outcomes and planning hints (idea, 2026-10-11)" has the full idea; this item is its smallest useful version (its items 1 and 3).

### Requirements

- A `task_outcomes` table, one row per archived task: change, task, capability, scope glob count, resolved scope file count, verify kind (one test file, several, whole suite, other), `tests.modify`, `verify_starts`, depends on an earlier task, position in the change; and attempts, done on the first attempt, final dead reason, files touched.
- The plan prompt has a `## What history says` section with a fixed set of statistics computed from `task_outcomes`, each stating its counts, such as first-attempt rate by scope size and by verify kind, and the most common dead reasons in the recent window.
- The section is absent until the archive has a configured minimum of tasks, uses a configured window of recent tasks, and is capped in characters; all three are config with defaults.
- Nothing blocks or warns on these numbers.

### Non-goals

- `co_changed_files`, approve notices, plan-size budgets (later items on the Notion page).
- The planner declaring a verify kind in frontmatter; it is parsed from the command.
