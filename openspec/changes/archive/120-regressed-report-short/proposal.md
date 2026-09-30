---
title: A regressed report holds the failure, not the whole verify log
depends_on: []
verify: pnpm verify
features:
  reads:
    - status-inspection
    - spec-lint-and-approve
    - version-control
    - web-inspection
---
## Goal

A failure marker under `.run/` should show a human or planner why a verify
failed: the failing tests and the end of the output. Today every marker built
from a verify run holds the whole output. On 2026-09-29, 113's
`.run/regressed/change.md` was 306 KB, the whole `pnpm verify` log. Its one
failure was in `tests/living-specs-delta-equivalence.test.ts`, whose
`assert.equal` of two whole living specs printed both, about 8 KB each.

After this change, every such marker holds an excerpt. If the output has a
`✖ failing tests:` section, the excerpt is that section. Otherwise it is the
last lines of the output. Long lines are cut, and the last line of the excerpt
names the event that still holds the full output. The equivalence test reports
a mismatch as the first differing lines, not two whole specs.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests drive each marker
writer through its real entry point (`verifyArchiveStep`, `runTask`, and
`auditScopeRegressions`) with long failing output. They check that the marker
holds only the excerpt and the pointer line, and that the event still holds
the full output.

## Non-goals

- Changing the `verify_ran` event or its `output`.
- Summarizing output with a model.
- Changing the `focused_ran`, `regressed`, or `recertification` events, or
  the `dead` event's `error`.
- Shortening output that is not written to a `.run/` marker, such as the
  `sync_failed` detail, which `outputTail` in `src/core/vcs/sync-verify.ts`
  already cuts to `limits.cardOutputLines`.

## Surface

- Added: `limits.markerOutputLines` (config key, default 40)
- Added: `limits.markerLineChars` (config key, default 400)
- Changed: the body of `.run/regressed/<n>.md` for `verify_red` and `scope_regression`, and of `.run/dead/<n>.md` for `verify_red`, `change_verify_red`, `verify_precondition`, and `baseline_red`: an output excerpt ending in a `Full output:` line
- Changed: `baseline_ran` event gains `output` when the run failed

## Decisions

- ADR 001: unchanged; the two limits merge from `osq.config.ts` through the existing loader.
- ADR 002: unchanged; archive still merges deltas without a model. Only the text of the regressed marker it writes changes.
- ADR 004: unchanged; no validator call moves.
- ADR 005: unchanged; no validator call moves.

## Background

**Every writer.** Seven places copy a verify run's output into a `.run/` marker:

| Marker | Reason | Built in | Full output stays in |
|---|---|---|---|
| `regressed/<target>.md` | `verify_red` | `verifyArchiveStep`, `src/watcher/archive-verify.ts` | `verify_ran`, `.run/events/<target>.jsonl` |
| `regressed/<n>.md` | `scope_regression` | `buildScopeRegressionMarker`, `src/core/run/scope-hash.ts` | `verify_ran`, `.run/events/<n>.jsonl` |
| `dead/<n>.md` | `verify_red` | `verifyRedFailure`, `src/watcher/task-verify.ts` | `verify_ran`, `.run/events/<n>.jsonl` |
| `dead/<n>.md` | `verify_red`, `focused: true` | `formatFocusedDeadMarker`, `src/watcher/focused-verify.ts` | `focused_ran`, `.run/events/<n>.jsonl` |
| `dead/<n>.md` | `verify_precondition` | `formatPreSpawnDeadMarker`, `src/watcher/task-verify.ts` | `verify_ran`, `.run/events/<n>.jsonl` |
| `dead/<n>.md` | `change_verify_red` | `formatChangeVerifyMarker`, `src/watcher/change-verify.ts` | `verify_ran`, `.run/events/change.jsonl` |
| `dead/<n>.md` | `baseline_red` | `formatBaselineDeadMarker`, `src/watcher/baseline.ts` | `baseline_ran`, `.run/events/change.jsonl` |

`baseline_ran` records no output today, so a failed baseline's event gains
`output`. Otherwise the full output would be lost.

**Retry prompts get the excerpt.** "Retried executor context" feeds the
retained dead marker's body into the next prompt, bounded at 2,000
characters. From now on the next attempt sees the failing tests instead of
the start of a long log.

**Readers.** `osq show`, the dispatch cards, and the dashboard read the marker
body as text. The cards show its last `limits.cardOutputLines` lines, which
now end with the `Full output:` line. `parseActiveStaleTask` reads a scope
regression marker's body back as output, and `osq retry` reads the differing
paths from the body's first paragraph. Neither depends on how long the output
is. No test pins the output text of any of these markers.

**Measured fallout.** A rough version of the whole change was run in a
scratch worktree on 2026-09-30, through both typechecks, lint, and the full
suite, UI tests included. It failed only the tests that fail without a build
on main as well, plus one budget:
`src/core/run/scope-hash.ts` went to 252 lines. Task 3 moves
`buildScopeRegressionMarker` and `parseActiveStaleTask` to a new module, and
`scope-hash.ts` re-exports them. `src/watcher/regression.ts` is at 248 lines
and ends at 250 with the new option, so it gets no new import:
the option is typed through the `OsqConfig` it already imports.

## Contract

### Requirement: A marker holds the failure, not the whole log
Every `.run/` marker built from a verify run's output SHALL hold an excerpt:
the `✖ failing tests:` section when there is one, otherwise the last
`limits.markerOutputLines` lines. Each line is cut to `limits.markerLineChars`
characters, and the excerpt ends by naming the event that holds the full
output.

#### Scenario: Archive failure with a failing-tests section
- **WHEN** archive-time change verification fails and its output is 500 lines followed by a `✖ failing tests:` section
- **THEN** `.run/regressed/change.md` holds the section and none of the 500 lines, and ends with `Full output: the verify_ran event in .run/events/change.jsonl`

#### Scenario: Long line
- **WHEN** a kept line is 1,000 characters and `limits.markerLineChars` is 400
- **THEN** the marker holds its first 400 characters followed by `… (600 more characters)`

### Requirement: Equivalence mismatch shows the first difference
`tests/living-specs-delta-equivalence.test.ts` SHALL report a living spec that
differs from its replay as the first differing line and a few lines of context
around it, not as two whole specs.

#### Scenario: One line differs
- **WHEN** a living spec differs from its replay at one line
- **THEN** the failure message names that line number and shows a few lines around it from each side, and nothing else from either spec

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: adds "Verify output excerpt in markers"; modifies "Baseline verify before a change's first task".
- `specs/cli-foundation/spec.md`: adds "Marker output limits".

Four tasks. No file is shared. Tasks 2 and 3 import `excerptVerifyOutput`
from `src/core/run/verify-excerpt.ts`, which task 1 creates, so they run after
task 1. Task 4 stands alone.
