---
title: osq lint refuses a delta that gives a capability a second scenario with the same name
depends_on: []
verify: pnpm verify
features:
  reads: [traceability, cli-foundation, status-inspection, watcher-and-harness]
---
## Goal

`osq lint` reports an error when a change's delta would leave a capability with
a scenario name it holds twice, where the living spec held it at most once.
Today the planner finds out only when the first task's baseline goes red,
because `scenario()` lookups throw on duplicate names: 191 passed lint, then
every `scenario('web-inspection', …)` test threw on a second "Phone width", and
191 was rejected and replanned as 192.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/duplicate-scenario-lint.test.ts` proves every scenario of
"Repeated scenario name refusal" and "Repeated scenario name exceptions" through `lintChangeFolder` and `approveSpec`.

## Non-goals

- Renaming the duplicates five living specs already hold (cli-foundation 8,
  watcher-and-harness 5, spec-lint-and-approve 2, metrics-and-reporting 1,
  status-inspection 1). Generated changes can do that later.
- Checking scenario names across capabilities.
- Changing `lookupScenario` or the `scenario()` helper.

## Surface

- Added: lint error `<capability>: scenario "<name>" appears in both "<first requirement>" and "<second requirement>"; give each scenario of a capability its own name`.

## Decisions

- ADR 004: unchanged; the check runs inside osq's own lint on the text `mergeDelta` produces, not through the OpenSpec validator.
- ADR 005: unchanged; nothing here checks the validator range.

## Assumptions

- A name repeated inside one requirement counts too, as it does for `lookupScenario`; the error then names that requirement twice.
- A name the living spec already repeats stays allowed however many more times the delta adds it, as the brief asks.
- Living spec is read from the project's `openspec/specs/`, the base `verifyDeltaTargets` already merges against.

## Contract

### Requirement: Repeated scenario name refusal

`osq lint` SHALL refuse a delta that leaves a capability holding a scenario name
more than once when its living spec held that name at most once.

#### Scenario: Delta adds a taken scenario name
- **WHEN** the living `web` spec's requirement `Approve review view` has the scenario `Phone width` and a delta ADDS `Change page` with the scenario `Phone width`
- **THEN** `osq lint` reports the change invalid, naming `web`, `Phone width`, `Approve review view` and `Change page`

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: adds "Repeated scenario name refusal" and
  "Repeated scenario name exceptions".

One task. No file is shared between tasks.

## Background

The check parses the living text and the text `mergeDelta` returns with
`parseCapabilitySpec`, the same merge and parse `lookupScenario` in
`src/core/trace/scenario-lookup.ts` uses, so lint and the test helper agree on
what one capability's scenarios are. `verifyDeltaTargets` in `linter.ts`
already holds both texts; it gains one call and stays under the 80-line
function budget.

**Measured on 2026-10-15** in a scratch worktree at c9d50805 with a rough
version of the check. Exactly four existing tests broke, each because a
fixture delta reused a living scenario name (`Works`, `Route`):
`tests/impact-lint.test.ts`, `tests/ungoverned-lint.test.ts`,
`tests/instructions-drift.test.ts` and `tests/source-comment-lint.test.ts`.
Renaming those fixture scenarios made all four pass with no assertion
changed, so the task scopes them with `tests.modify: true`.
