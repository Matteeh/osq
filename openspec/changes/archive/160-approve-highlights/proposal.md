---
title: The approve view opens with what the human must notice
depends_on: ["159"]
verify: pnpm verify
features:
  reads: [status-inspection, traceability, version-control]
---
## Goal

The approve view, in the dashboard and in `osq approve`, opens with a short
Notices block that osq derives from the plan: at most five notices sorted
red, amber, grey, the rest folded, and `Nothing unusual` when nothing red or
amber fired. In the dashboard, Approve stays disabled until each red notice
has been opened. osq records which notices each plan version raised, which
were opened, and what followed (approved, planned again, rejected, halted),
so `osq query` can show which notices matter and which can be dropped. The
proposal gains a fixed `## Assumptions` section, which feeds one of the
notices. osq also records the plan's hash each time `osq lint <id>` first
finds a new version clean, which builds ADR 006 decision 6 (count plan
revisions between ready and approval). This applies ADR 014 decision 10,
"every tap view leads with what the human must notice", to the approve view
first, because it is useful locally and needs no server.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
tests check each notice rule as a table over fixture plans
(`tests/notices-rules.test.ts`), the ready records written by `osq lint`
(`tests/plan-ready-lint.test.ts`), the notices printed, gated and recorded by
`osq approve` (`tests/approve-notices.test.ts`), the web review and approve
request (`tests/web-notices.test.ts`), the notice block and the Approve gate
(`tests/ui-notices.test.tsx`), and the `notices` query table
(`tests/query-notices.test.ts`).

## Non-goals

- Predicting task deaths. The 140–158 backtest found no plan rule that
  predicted one; that stays with the gates.
- An AI reviewer at plan time.
- "I understood" checkboxes. Opening a notice is recorded as opened, never as
  understood (ADR 006 decision 3).
- Gating `osq approve` in the CLI on opened notices. The CLI prints the
  notices; only the dashboard has notices to open.
- Changing the approval flags, the digest text, or `--confirm`.
- Rows for active changes in `osq query`; its tables stay history.

## Surface

- Added: `## Assumptions` proposal section, between `## Decisions` and `## Contract`, in the template, the schema, `PLANNER.md`, and lint.
- Added: config keys `notices.maxShown`, `notices.maxTasks`, `notices.maxResolvedFiles`, `notices.rulePaths`.
- Added: `plan_ready` record in `<change>/.run/plan.jsonl`, written by `osq lint <id>`.
- Added: `Notices:` block in `osq approve` output, before the digest.
- Added: `notices` field in an approval's `.run/manifest.json`.
- Added: `review.notices` on the web change document, and the dashboard's `Notices` section.
- Added: optional `opened` field on the dashboard's approve request body.
- Added: `notices` table in `osq query`.
- Added: notice ids `rules_path`, `removed_requirement`, `adr_departure`, `many_tasks`, `large_scope`, `package_json`, `assumptions`, `verify_starts_any`, `uncovered_requirement`, `tests_modify`, `new_capability`, `plan_revised`.

## Decisions

- ADR 001: unaffected; the `notices` block is validated in `defineConfig` like every other block.
- ADR 002: unaffected; archive applies these deltas without a model as usual.
- ADR 004: unaffected; the assumptions lint is osq's own check beside the pinned validator.
- ADR 005: unaffected; no OpenSpec version changes.
- ADR 008: the `notices` query table is built in memory from change files on each call, like the other history tables, and stored nowhere.
- ADR 009: the approve request gains an optional `opened` list; it still posts through the loopback actions endpoint with the token, and adds no new write path.
- ADR 010: unaffected; the validator neither reads nor writes notices.
- ADR 012: unaffected; no watcher or service change.

## Assumptions

- The defaults `notices.maxTasks: 6` and `notices.maxResolvedFiles: 15` are judgement calls, not backtested thresholds.
- "Reported ready" means a clean `osq lint <id>`. A planner who lints clean and then keeps editing counts those edits as revisions.
- Opened notices live only in the page. A reload closes them again, and the dashboard needs them opened again before Approve.
- A delta can only drop a scenario by removing its requirement, because lint refuses a MODIFIED requirement that drops one. The red notice therefore covers removed requirements.

## Contract

### Requirement: Approval notices

`buildApprovalNotices` SHALL derive at most one notice per id from the change
folder, its approval digest, and config. Red: scope reaches osq's rules, a
removed requirement, an ADR departure. Amber: too many tasks, a large task
scope, `package.json` in scope, assumptions, `verify_starts: any`, a
requirement no task's tests cover. Grey: `tests.modify`, a new capability, a
revised plan.

#### Scenario: Nothing unusual
- **WHEN** a change trips only `new_capability`
- **THEN** `unusual` is false and the block reads `Nothing unusual`

### Requirement: Notice block view

The change view SHALL show the notices after the header, before the brief,
and keep Approve disabled until each red notice has been opened.

#### Scenario: Red notice gates Approve
- **WHEN** the actions hold `approve` and the red notice `removed_requirement` has not been opened
- **THEN** the Approve button is disabled, and once the notice is opened a tap posts `{"verb":"approve","opened":["removed_requirement"]}`

### Requirement: Notice outcomes

`osq query` SHALL list each recorded notice of an archived or rejected change
with whether it was opened and what followed: `planned_again`, `approved`,
`halted`, or `rejected`.

#### Scenario: Revised then approved
- **WHEN** an archived change was linted clean with `rules_path`, revised, and approved with `assumptions`
- **THEN** `notices` holds `rules_path` with `planned_again` and `assumptions` with `approved`

## Human steps

### Before approval

- `osq.config.ts` has uncommitted local edits (the opencode harness switch). Task 3 adds a `notices` block to it, so commit or revert those edits before `osq approve 160`.

### After landing

- Run `pnpm build` in this checkout, because the globally linked `osq` serves `dist/` and `ui/dist`.

## Delta

- `specs/cli-foundation/spec.md`: modifies "One proposal format"; adds "Notices configuration".
- `specs/spec-lint-and-approve/spec.md`: adds "Proposal assumptions section", "Approval notices", "Notice order and folding", "Plan ready records", "Notices at approval".
- `specs/watcher-and-harness/spec.md`: adds "Approval notices in the manifest".
- `specs/web-inspection/spec.md`: modifies "Loopback write actions"; adds "Approve notices document" and "Notice block view".
- `specs/metrics-and-reporting/spec.md`: modifies "History query tables"; adds "Notice outcomes".

Eight tasks, in order. No file is shared between tasks.

## Background

**Measured on 2026-10-08** in a scratch worktree at 159, with rough cuts of
each part: the `## Assumptions` section in every template copy, the planner
block and the OpenSpec rules; the assumptions lint; a `notices` block in
`DEFAULT_CONFIG`; a `plan_ready` line appended by `osq lint <id>`; a `notices`
field in the approval manifest; notice lines in `osq approve` output; a sixth
query table; and the optional `notices`, `opened` and review-port types.
Both typechecks passed, all 130 UI tests passed, and four CLI tests failed:

- `tests/decisions-template.test.ts` pins the OpenSpec proposal rule's
  section list (task 1).
- `tests/golden-events.test.ts` compares `tests/fixtures/events/*.jsonl`,
  which change with the planner block; regenerate them with `UPDATE_GOLDEN=1`
  (task 1).
- `tests/line-budget.test.ts` failed because `src/core/foundation/config.ts`
  went to 251 lines (task 3 makes room).
- `tests/query-tables.test.ts` and `tests/query-command.test.ts` pin the five
  table names (task 8).

No other test changed, and the approve output lines broke no test.

**Why the gate lives in the dashboard.** Only the dashboard can tell whether
a notice was opened. The server's approve action passes the page's `opened`
list into `approveSpec` as `openedNotices`, and `confirmApproval` refuses an
unopened red notice before anything is written, so the gate holds even for a
hand-made request that carries `opened`. A request without `opened`, like the
CLI, approves as today; `tests/web-actions.test.ts` and
`tests/ui-actions.test.tsx` post `{"verb":"approve"}` and must keep passing.

**Why the notices record rides on the digest.** Six approval paths pass
`digest` and `mode` from `confirmApproval` to `writeApprovalSeal`.
`ApprovalDigest` gains an optional `notices` field that only
`confirmApproval` sets, so `writeApprovalSeal` can record it in the manifest
without changing any path's signature. `buildApprovalDigest` never sets it,
so `tests/web-data-review.test.ts`, which compares the review digest with
`buildApprovalDigest`, is unaffected.

**What already exists.** `buildApprovalDigest` gives task titles, existing
scope file counts, `testsModify` and `existingTests`, capability `removed`
names and `creates`, and the `adr_departure` flags. `parseTaskMd` and
`resolveScope` give a task's scope paths and `verifyStarts`. `scopeCoversPath`
in `src/core/run/scope.ts` matches a path against scope patterns.
`hashChangeFolder` gives the hash approval seals. `parsePlanRecords` skips
any record without a `sessionId`, so `plan_ready` lines never reach the
planning readers. `readManifestObject` in `src/core/report/change-reads.ts`
reads a manifest. The dashboard's `--status-dead`, `--status-regressed` and
`--status-pending` tokens already have light and dark values.
