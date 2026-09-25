# Spec Delta: CLI Foundation

## MODIFIED Requirements

### Requirement: Executor protocol constants and result headings
<!-- source: src/core/foundation/init-blocks.ts, AGENTS.md, .opencode/agent/osq-coder.md, tests/managed-blocks.test.ts, tests/executor-planner-wording.test.ts -->
The step lines of the managed `## Executing a task` section and the body lines
of `## Exiting` SHALL be exported constants in
`src/core/foundation/init-blocks.ts`, and `MANAGED_AGENTS_MD_BODY` SHALL be
assembled from them. `## Exiting` SHALL name the result headings `## Changed`,
`## Deviated`, `## Missing context`, `## Outside scope`, `## Blocked`, and
`## Next` in that order, tell the executor to leave out empty ones, and require
a final `Touched:` line listing every changed file other than the result file.
Each disclosure heading's purpose SHALL name who reads it: `## Deviated` is what
the executor did differently from the task, for the reviewer; `## Missing
context` is what the task lacked, for the planner; `## Outside scope` is what
the executor found broken outside its scope and left alone, for the human.
`## Blocked` is what the executor needs before the task can be finished within
its scope, for the human.

Step 2 SHALL read exactly: `2. Can't finish within your task's scope, or too big
for one pass? Write what you need under ## Blocked in .run/results/<n>.md, and
exit without code.`, with `scope`, `## Blocked`, and `.run/results/<n>.md` in
backticks.

#### Scenario: Result headings defined once
- **WHEN** `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** it contains every exported executor step line and every exported exit line verbatim, and the exit lines name `## Changed`, `## Deviated`, `## Missing context`, `## Outside scope`, `## Blocked`, `## Next`, and `Touched:`

#### Scenario: Repository copies stay current
- **WHEN** the managed block in the repository's `AGENTS.md` or `.opencode/agent/osq-coder.md` is inspected
- **THEN** it equals `MANAGED_AGENTS_MD_BODY`

#### Scenario: Disclosure headings name their reader
- **WHEN** the exit lines are inspected
- **THEN** `## Deviated` names the reviewer, `## Missing context` names the planner, and `## Outside scope` names the human

#### Scenario: Blocked stop
- **WHEN** step 2 and the exit lines are inspected
- **THEN** step 2 tells an executor that can't finish within its scope to write `## Blocked` and exit without code, and `## Blocked` names the human

### Requirement: Planner protocol rules in documentation and templates
<!-- source: PLANNER.md, templates/PLANNER.md, src/core/foundation/init-blocks.ts, tests/init-planner.test.ts, tests/human-steps-guidance.test.ts, tests/executor-planner-wording.test.ts -->
The managed planner block in `PLANNER.md`, `templates/PLANNER.md`, and
`src/core/foundation/init-blocks.ts` SHALL encode slicing, detail, file tool,
change-level verify, final-tree verification, and task file-ownership rules.
Every task verify SHALL exercise its complete slice through a real entrypoint
and remain safely re-runnable against the final tree of the completed change.
A file SHALL belong to one task unless a later task must extend it; that later
task SHALL be ordered after the first owner, SHALL have the file in its own
`scope`, and the proposal SHALL identify the shared file.
The block SHALL state interactive planning and the `osq plan` handoff as
separate modes sharing the write-boundary, lint, and no-approval rules. It SHALL
state that the watcher runs the change-level `verify` after every task, so tasks
that pass only together are one task; that when a later task whose `scope`
covers an earlier done task's file changed it, and nothing else touched the
file, the watcher recertifies the earlier task itself if its `verify` still
passes, while any other change to an earlier done task's resolved `scope`
halts the change until a human runs `osq retry`; that globs resolve again at
every audit; that a preexisting test changes only with `tests.modify: true` and
the file in `scope`; and that `osq lint` enforces the configured limits on
scope patterns and acceptance lines. The block SHALL NOT tell planners to list
an expected `osq retry` for a shared file.

#### Scenario: Managed block encodes planner discipline
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it requires complete real-entrypoint and final-tree verifies, forbids out-of-scope executor excuses, mandates acceptance lines and reuse names without signatures or numbered steps, requires single-task file ownership with ordered documented extensions, requires file tool usage, and places change-level verify immediately after the goal

#### Scenario: Managed block encodes between-task watcher rules
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** its task rules state the change-level verify after every task, automatic recertification of a file extended by a later task that has it in scope, the scope-overlap halt resolved by `osq retry` for any other change, glob re-resolution, and the `tests.modify` rule

#### Scenario: Byte-equality test for planner templates
- **WHEN** `tests/init-planner.test.ts` executes
- **THEN** it asserts byte-for-byte equality between the `PLANNER.md` managed block, `templates/PLANNER.md`, and `MANAGED_PLANNER_BLOCK` in `src/core/foundation/init-blocks.ts`

#### Scenario: No expected retry for a shared file
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it doesn't contain `list the expected \`osq retry\``
