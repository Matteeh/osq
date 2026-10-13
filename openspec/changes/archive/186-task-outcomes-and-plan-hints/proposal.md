---
title: osq query has task shapes next to outcomes, and the plan prompt shows what history says
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
---
## Goal

The planner should learn which task shapes pass and which fail in this
project, and osq already has the data to tell it. Today `osq query` shows a
task's title, attempts and whether it finished. It does not show what the plan
decided: the scope size, the kind of verify, `tests.modify`, `verify_starts`,
or whether the task shares scope with an earlier task. A planner also has to
think of running a query before history can help it.

With this change, `osq query` gains a `task_outcomes` table with one row per
archived task. Each row holds the shape the plan gave the task and what
happened to it: attempts, whether it passed on the first attempt, its last
dead reason, and how many files it touched. Once the archive holds enough
tasks that ran, the plan prompt gains a short `## What history says`
section. The section gives first-attempt counts by scope size, verify kind,
`tests.modify`, shared scope and position, and the most common dead reasons,
all over a window of recent tasks. Three config keys set the threshold, the
window and a character cap. The numbers only inform: nothing blocks or warns
on them.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree. That
includes the new `tests/query-task-outcomes.test.ts` and
`tests/plan-history.test.ts`, the query tests that pin today's table list, and
the planning config test that pins today's defaults.

## Non-goals

- `co_changed_files`, approve notices, and plan-size budgets: the later items of the Notion idea page.
- A frontmatter field for the verify kind. osq parses the kind from the command.
- Any gate, warning, lint finding, notice or event that reads these numbers.
- Rows for changes that are not archived.
- Changing the `tasks` or `dead_attempts` tables, or the repository record.

## Surface

- Added: `osq query` table `task_outcomes(change, task, capability, scope_globs, scope_files, verify_kind, tests_modify, verify_starts, shares_scope, position, attempts, first_attempt, dead_reason, files_touched)`
- Added: `## What history says` plan prompt section
- Added: `planning.history.minimumTasks`, `planning.history.recentTasks`, `planning.history.maxCharacters` (config keys, defaults 30, 100, 1500)

## Decisions

- ADR 001: the `planning.history` block loads through the existing config loader; no other loader is added.
- ADR 004: the OpenSpec validator is not touched.
- ADR 005: the OpenSpec peer range is not touched.
- ADR 008: `task_outcomes` is built per call from the archived change files like the other tables and stored nowhere. The plan prompt builds the same in-memory tables and reads `task_outcomes` from them.
- ADR 010: the validator is not touched.
- ADR 012: the watch service is not touched.
- ADR 015: `osq mcp` gains no tool; its plan prompt gains the section only because it uses the same `buildOpeningPrompt`.

## Assumptions

- `capability` uses today's living Code ownership, not the ownership in place when the task ran. Files that have since moved count toward their current owner.
- `shares_scope` is the stand-in for "depends on an earlier task": task files have no per-task `depends_on`, and the planner's rule for extending another task's file is to repeat it in scope.
- A test file token is one whose base name holds `.test.` or `.spec.`, the naming traceability's `isTestPath` already uses for files. A verify in a language that names tests differently reads as `suite` or `other`. This only labels history and gates nothing, so it stays outside the languages kernel slice.
- The default threshold of 30 tasks that ran and window of 100 suit this repository, which has about 650 archived tasks. A new project sees no section until its 30th task that ran.
- Building every history table at plan time adds about four seconds to `osq plan` here. That is acceptable for a command run once per change.

## Contract

The metrics-and-reporting and cli-foundation deltas below are the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/metrics-and-reporting/spec.md`: ADDED "Task outcome query table", "What history says in the plan prompt"; MODIFIED "Trial query tables" (its listed scenario no longer counts twelve tables), "History query safety" (no fixed table count).
- `specs/cli-foundation/spec.md`: MODIFIED "Interactive planning command" (places the new section between the record and the disclosures).

Every file belongs to one task. Task 2 reads `buildHistoryTables` and the
`task_outcomes` table that task 1 adds, without editing task 1's files.
