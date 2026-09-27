---
title: A result section that says only None counts as empty, however it is written
depends_on: []
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
    - watcher-and-harness
---
## Goal

A one-line result section that says `None`, written as a bullet, in bold,
or followed by a short explanation, counts as empty. A task is never killed
as `blocked` because its executor wrote `- None.` under `## Blocked`, and
`- None.` under a disclosure heading is never counted as a disclosure.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The new test drives
`parseResultSections` with the shapes found in osq's own archive and the
counter-case that must stay content, and runs one watcher cycle with a fake
agent whose result file says `- None.` under `## Blocked`, which must reach
the verify and archive.

## Non-goals

- Running `verify` when `## Blocked` holds real content, or finishing a
  blocked task whose verify passes. `## Blocked` stays the executor's
  explicit request for a human, checked before verify.
- Other words for nothing, such as `N/A`, `Nothing`, or `Not blocked`.
  None of them occurs in the archive's empty sections, and guessing at
  meaning under `## Blocked` could swallow a real need.
- Multi-line sections. A section with more than one non-blank line is
  always content.
- Changing the executor protocol text or the dead marker.

## Surface

None

## Decisions

- ADR 002: unchanged; archive still merges deltas without a model.

## Background

`cleanSection` in `src/core/report/result-sections.ts` treats a section as
empty only when its trimmed text is exactly `None`, any case, with an
optional period. `checkBlocked` in `src/watcher/blocked.ts` fails a task
with reason `blocked` when the parsed `blocked` is not null, before any
verify runs (change 078). In a consumer project an executor wrote `- None.`
under `## Blocked`, and a task whose tests all passed died as blocked. The
same parser feeds `readChangeDisclosures`, so `osq report` and the plan
prompt's "Recent executor disclosures" count `- None.` as a disclosure.

As of 2026-09-27, osq's archive holds about 170 one-line result sections:
102 are `None.`, 40 are `- None.`, and about 12 are `None` followed by `;`
or `.` and an explanation, such as `None; the task is complete.` A few
start with `Nothing`, and none is `N/A`. Every one is a single line.

The rule reads the shape, not the meaning: after a list marker and the
emphasis characters are set aside, the line is the word `None`, alone or
followed straight away by `.`, `;`, `,`, or `:`. `None of the fixtures
exist; I need a seed script` stays content, because `None` there runs into
a sentence. Every consumer of the parser gets the fix, so no caller changes.

Archived changes' disclosure counts in `osq report` drop once this lands,
because their bulleted `None` sections stop counting. No test pins such a
count.

## Contract

### Requirement: Real content is never lost
A result section with more than one non-blank line, or whose single line
does not start with `None` followed by the end or `.`, `;`, `,`, or `:`,
SHALL be returned as before.

#### Scenario: Counter-case
- **WHEN** `## Blocked` says `None of the fixtures exist; I need a seed script`
- **THEN** `blocked` holds that text

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/metrics-and-reporting/spec.md`: modifies "Result file sections".
- `specs/watcher-and-harness/spec.md`: modifies "Blocked exit".

One task.
