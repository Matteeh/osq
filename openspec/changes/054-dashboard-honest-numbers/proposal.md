---
title: Dashboard honest numbers
depends_on:
  - '058'
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
    - web-inspection
---
## Goal

This is the first of four dashboard changes (054 to 057). It fixes the numbers
that contradict each other, so every value the dashboard and `osq report`
show is correct and honestly labelled.

Three bugs were seen on this repository:

- **0 active changes next to 8 pending tasks.** `now.pending` counts the eight
  tasks of `001-bootstrap` and `002-spec-lint-and-approve`. Both were archived
  before done markers existed, so their tasks have no marker. Nothing can run
  in an archived change, so those tasks aren't pending.
- **Unreported cost shown as `$0.0000`.** When sessions or attempts were
  recorded but none reported a cost, the sum of zero reported values is `0`.
  One example is change 053: one planning session, no cost reported. The
  report's `formatCost(0)` and three copies of the UI's `formatCost` then
  print `$0.0000`.
- **A "Brief brief absent" heading.** `BriefPanel` puts its "brief absent"
  label inside the `Brief` heading.

## Verify

`pnpm verify`

The suite checks four things. Unmarked archived tasks count as `unmarked`, not
`pending`, in JSON and text. Every cost that no harness reported is `null` in
the web documents and labelled `not reported` in the report and the dashboard.
Partially reported costs keep their coverage. The brief panel has a plain
heading. It needs no network service, TTY, or real model.

## Non-goals

- New metrics. `unmarked` splits an existing count; it measures nothing new.
- Changing the report's numeric `cost.total` fields. They stay the sum of
  reported values, and only their formatted text changes.
- Layout, navigation, or styling. Changes 055 and 056 cover those.

## Surface

- Changed: `osq report` gains an `unmarked` count in JSON `now` and an
  `Unmarked:` text line (report field).
- Changed: an unreported cost reads `not reported` instead of `$0.0000` in
  `osq report` text, report JSON `formattedTotal`, and the dashboard (display
  text).

## Contract

### Requirement: Unmarked archived tasks

The report SHALL count a task in an archived change that has no done, dead,
regressed, or running marker as `unmarked`, not `pending`.

#### Scenario: Pre-marker archive
- **WHEN** an archived change has tasks without markers and no change is active
- **THEN** `now.pending` is 0, `now.unmarked` counts those tasks, and `now.total` is unchanged

### Requirement: Unreported cost

A cost that no attempt or session reported SHALL be null in web documents and
SHALL read `not reported` wherever osq formats it. A partially reported cost
SHALL keep its value and coverage.

#### Scenario: Planning session without cost
- **WHEN** a change has one planning session that reported no cost
- **THEN** its web planning cost is null and the dashboard shows `not reported`

## Human steps

- Review the proposal, both deltas, and the three task bodies, then run
  `pnpm osq approve 054` yourself after 058 archives. 058 removes the test
  race that would otherwise put each `pnpm verify` here at risk.

## Delta

- `specs/metrics-and-reporting/spec.md` modifies `Task and specification metrics
  derivation` and adds `Unreported cost labelling`.
- `specs/web-inspection/spec.md` adds `Unreported web cost` and `Honest
  dashboard labels`.

Task 1 owns the report core, task 2 the web documents, and task 3 the UI. No
file belongs to two tasks.
