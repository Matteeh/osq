## ADDED Requirements

### Requirement: Proposal assumptions section
`readAssumptions(body)` SHALL return null when a proposal body has no
`## Assumptions` section. Otherwise it SHALL return the section's non-empty
lines after HTML comments are removed, each trimmed and without a leading `- `
list marker, and an empty list when the only line is `None`. `osq lint` and
`osq approve` SHALL reject a `proposal.md` whose `## Assumptions` section holds
nothing but HTML comments and whitespace, with the error
`proposal.md's ## Assumptions section is empty: write None or one line per assumption`.
A proposal without the section and a legacy `spec.md` change document SHALL
get no assumptions finding.

#### Scenario: Assumptions read from a section
- **WHEN** a proposal body's `## Assumptions` section is read
- **THEN** `readAssumptions` returns the value in the table

| section | result |
| --- | --- |
| absent | null |
| `None` | [] |
| `- The cache is per process.` and `Every caller passes an absolute path.` | ["The cache is per process.", "Every caller passes an absolute path."] |
| an HTML comment and `None` | [] |

#### Scenario: Comment-only assumptions
- **WHEN** a proposal's `## Assumptions` section holds only an HTML comment
- **THEN** `osq lint` fails with the assumptions error

#### Scenario: Proposal without assumptions
- **WHEN** a proposal has no `## Assumptions` section
- **THEN** lint reports no assumptions finding

### Requirement: Approval notices
`buildApprovalNotices(projectRoot, folderPath, config, digest)` SHALL derive a
change's notices from its change folder, its approval digest, and config
alone, with at most one notice per id. Each notice SHALL carry an `id`, a
`severity` of `red`, `amber` or `grey`, a `label` and a `detail`. A detail
lists its parts joined by `; `, tasks in task-number order and paths in
code-unit order. The notices are:

- `rules_path`, red, when a task's resolved scope holds a path that
  `scopeCoversPath` matches against `AGENTS.md`, `PLANNER.md`, `CLAUDE.md`,
  `<paths.decisions>/`, `<paths.templates>/`, or an entry of
  `notices.rulePaths`. Label `scope reaches osq's rules`; one part
  `task <n>: <path>, <path>` per such task.
- `removed_requirement`, red, when a delta removes a requirement. Label
  `removes requirements`; one part `<capability>: <requirement>` per removed
  requirement.
- `adr_departure`, red, when the digest holds an `adr_departure` flag. Label
  `departs from an ADR`; one part per such flag, its excerpt.
- `many_tasks`, amber, when the change has more tasks than
  `notices.maxTasks`. Label `<k> tasks`; detail
  `more than notices.maxTasks (<max>)`.
- `large_scope`, amber, when a digest task's `scopeFiles` exceeds
  `notices.maxResolvedFiles`. Label `large task scope`; one part
  `task <n>: <k> files` per such task.
- `package_json`, amber, when a resolved scope path's file name is
  `package.json`. Label `package.json in scope`; one part `task <n>: <path>`
  per such path.
- `assumptions`, amber, when `readAssumptions` gives at least one line. Label
  `1 assumption` or `<k> assumptions`; one part per line.
- `verify_starts_any`, amber, when a task declares `verify_starts: any`. Label
  `verify_starts: any`; one part `task <n>` per such task.
- `uncovered_requirement`, amber, when `traceability.capabilities` opts a
  delta's capability in and one of its added or modified requirements has no
  scenario that any task lists under `## Scenarios` as
  `- <capability>: <scenario name>`. Label `requirements no task's tests cover`;
  one part `<capability>: <requirement>` per such requirement.
- `tests_modify`, grey, when a digest task has `testsModify`. Label
  `tests.modify`; one part per such task, `task <n>: <test>, <test>` from its
  `existingTests`, or `task <n>` when it has none.
- `new_capability`, grey, when a digest capability has `creates`. Label
  `new capability`; one part per such capability, its name.
- `plan_revised`, grey, when the plan's revision count under "Plan ready
  records" is above zero. Label `plan revised 1 time` or
  `plan revised <k> times`; detail `since osq first recorded it ready`.

#### Scenario: Each rule fires on its own
- **WHEN** a fixture change differs from a plain two-task change only by the row's plan
- **THEN** its notices are exactly the row's id, severity and label

| plan | id | severity | label |
| --- | --- | --- | --- |
| task 1 scopes `PLANNER.md` | rules_path | red | scope reaches osq's rules |
| task 2 scopes `decisions/` | rules_path | red | scope reaches osq's rules |
| the delta removes requirement `Alpha one` | removed_requirement | red | removes requirements |
| Decisions holds `Departs from ADR 001: the loader needs a second engine.` | adr_departure | red | departs from an ADR |
| seven tasks with `notices.maxTasks` 6 | many_tasks | amber | 7 tasks |
| task 1 resolves 16 existing files with `notices.maxResolvedFiles` 15 | large_scope | amber | large task scope |
| task 2 scopes `packages/ui/package.json` | package_json | amber | package.json in scope |
| Assumptions holds two lines | assumptions | amber | 2 assumptions |
| task 2 declares `verify_starts: any` | verify_starts_any | amber | verify_starts: any |
| traceability opts `alpha` in and no task lists a scenario of an added requirement | uncovered_requirement | amber | requirements no task's tests cover |
| task 1 declares `tests.modify: true` | tests_modify | grey | tests.modify |
| the delta creates capability `beta` | new_capability | grey | new capability |
| two `plan_ready` records with different hashes | plan_revised | grey | plan revised 1 time |

#### Scenario: Plain change
- **WHEN** a two-task change trips none of the rules
- **THEN** it has no notice

#### Scenario: Covered requirement
- **WHEN** traceability opts `alpha` in and task 2 lists `- alpha: Bulk price` for the added requirement holding that scenario
- **THEN** no `uncovered_requirement` notice fires

### Requirement: Notice order and folding
`ApprovalNotices.notices` SHALL hold every notice, red before amber before
grey, and within a severity in the order "Approval notices" lists their ids.
`maxShown` SHALL be `notices.maxShown`; the notices after the first `maxShown`
are folded. `unusual` SHALL be false exactly when no notice is red or amber.
`formatApprovalNotices(notices)` SHALL return the first line
`Notices: Nothing unusual` when `unusual` is false and `Notices:` otherwise,
then `  <SEVERITY> <label> — <detail>` for each shown notice with the severity
in upper case, then, when any notice is folded,
`  <k> more: <label>, <label>` naming the folded notices.

#### Scenario: Seven notices
- **WHEN** a change trips two red, three amber and two grey notices with `notices.maxShown` 5
- **THEN** the first five are the two red and the three amber in rule order, and the last line is `  2 more: <label>, <label>` with the two grey labels

#### Scenario: Nothing unusual
- **WHEN** a change trips only `new_capability`
- **THEN** `unusual` is false and the lines are `Notices: Nothing unusual` and `  GREY new capability — beta`

### Requirement: Plan ready records
When `osq lint` with explicit change ids finds a change valid, and that change
folder has neither `.run/approved` nor `.run/rejected.md`, osq SHALL append one
line to its `.run/plan.jsonl`:
`{"type":"plan_ready","timestamp":"<ISO>","data":{"hash":"<hash>","notices":[{"id":"<id>","severity":"<severity>","folded":<boolean>}]}}`,
where the hash is `hashChangeFolder` of the folder and the notices are its
current notices in order, unless the folder's last `plan_ready` record holds
the same hash. `osq lint` without ids SHALL append none. `readPlanReady(folderPath)`
SHALL return the folder's `plan_ready` records in file order, skipping blank and
malformed lines. The revision count SHALL be zero without a record, and
otherwise the number of records after the first, plus one when the folder's
current hash differs from the last record's hash. Readers of `plan_started`
and `plan_exited` records SHALL skip `plan_ready` lines.

#### Scenario: First clean lint
- **WHEN** `osq lint 001` passes on an unapproved change with no `plan_ready` record
- **THEN** `.run/plan.jsonl` gains one `plan_ready` record with the folder hash and the change's notices

#### Scenario: Lint again unchanged
- **WHEN** `osq lint 001` passes again and nothing in the folder changed
- **THEN** no record is appended

#### Scenario: Revised after ready
- **WHEN** a task file changes after the first record and `osq lint 001` passes again
- **THEN** a second record is appended and the revision count is 1

#### Scenario: No record
- **WHEN** lint fails, the change has `.run/approved`, or `osq lint` runs without ids
- **THEN** no `plan_ready` record is appended

### Requirement: Notices at approval
`osq approve` SHALL print `formatApprovalNotices` for each change before its
digest, with or without `--confirm`, and the review port SHALL receive the
notices with the digest. `approveSpec` SHALL accept `openedNotices`, the ids of
the notices an approver opened. When it is given and a red notice's id is not
in it, approval SHALL fail before the review with
`open each red notice before approving: <label>, <label>` naming the unopened
red notices, and write nothing. The digest `confirmApproval` returns SHALL
carry `notices`, the record `{ items, opened }`: `items` holds each notice's
`id`, `severity` and `folded`, and `opened` holds the given ids that name a
notice of the change, distinct and sorted, or is null when `openedNotices` was
not given. `osq serve`'s approve action SHALL pass a request's `opened` as
`openedNotices`.

#### Scenario: Notices before the digest
- **WHEN** `osq approve 001` runs on a change with a `removed_requirement` notice
- **THEN** stdout holds `Notices:` and `  RED removes requirements — alpha: Alpha one` before the digest

#### Scenario: Red notice not opened
- **WHEN** approval is asked with `openedNotices` `[]` and the change has a red notice
- **THEN** it fails naming that notice's label and no `.run/approved` or manifest is written

#### Scenario: Opened notices recorded
- **WHEN** approval is asked with `openedNotices` `["removed_requirement", "unknown"]`
- **THEN** the digest's `notices.opened` is `["removed_requirement"]`
