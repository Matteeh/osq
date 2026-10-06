---
title: The dashboard shows what landing a change will do, with a Land button
depends_on: []
verify: pnpm verify
features:
  reads: [cli-foundation, metrics-and-reporting, spec-lint-and-approve, traceability, watcher-and-harness]
---
## Goal

A human can decide to land an archived change from the dashboard without
opening a shell. One model in `src/core/status/`, `readLandView`, builds
everything that decision needs from files and refs osq already writes: each
gate osq ran at archive with its result and duration, the files changed and
lines added and removed against the branch's merge base, the living-spec
changes by capability, the executor disclosures (deviated, outside scope),
whether the change has landed, whether the default branch has moved since
archive so that land will sync and verify again, and any land halt or sync
stop. The web change document carries it as `land`, and the change view shows
it above the existing Land button. A landed change shows the same view as a
record; the dispatcher already offers no Land action for it. `osq show <id>`
for an archived change prints the same summary as a `Land:` section, from the
same model: one model, two renderers, as 147 set. This is M2 item 3.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
`tests/vcs-diff-stat.test.ts` checks the port's diff count on a temporary
repository. The new `tests/land-view.test.ts` builds archived changes in a
temporary git repository, one in an `osq/` worktree with the default branch
moved after it and one landed, and checks `readLandView`, `osq show`'s
`Land:` section and `getWebChange`'s `land`. The new `tests/ui-land.test.tsx`
renders the land view from literal documents and from a real `getWebChange`
document.

## Non-goals

- A full diff viewer, or listing the changed files.
- Changing what `osq land` does, what the Land button runs, or adding a gate.
- New events or markers. Everything comes from events, result files, markers
  and refs osq already writes.
- A land view for an active or rejected change.

## Surface

- Added: `land` field on the web change document (`GET /api/changes/<id>` and the static export's change documents).
- Added: `land` key in `osq show --json` for an archived change.
- Added: `Land:` section in `osq show <id>` for an archived change.
- Added: the change view's `Land` section for an archived change.

## Decisions

- ADR 009: the Land button still posts through the existing loopback actions endpoint; this change adds no write path or request, and the land view itself only reads.

## Contract

### Requirement: Land view model

For an archived change, `readLandView` SHALL return its archive gates, diff
count, spec changes, disclosures, landed state, default-branch movement and
halt, built only from files and refs osq already writes; for every other
change it SHALL return null.

#### Scenario: Default branch moved after archive
- **WHEN** an archived change's `osq/` branch is two commits behind the default branch
- **THEN** `landed` is false and `mainCommits` is 2

#### Scenario: Landed change
- **WHEN** the default branch holds the change's archive folder
- **THEN** `landed` is true and `mainCommits` is null

### Requirement: Land view

The change view SHALL show an archived change's land view before the actions,
so the Land button sits under what landing will do.

#### Scenario: Ready to land
- **WHEN** the change view renders an archived change whose `land` says the default branch has 3 new commits
- **THEN** it shows the gates, diff, spec changes and disclosures, and says landing will merge the 3 commits and run verify again

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` in this checkout, because the globally linked `osq` serves `dist/` and `ui/dist`.

## Delta

- `specs/version-control/spec.md`: adds "Vcs diff count".
- `specs/status-inspection/spec.md`: adds "Land view model" and "Land in show".
- `specs/web-inspection/spec.md`: adds "Land view document" and "Land view".

Three tasks, in order. Task 1 adds `diffStat` to the `Vcs` port. Task 2
builds `readLandView`, prints it in `osq show`, and sets `WebChange.land`.
Task 3 renders it in `packages/ui/`. No file is shared between tasks.

## Background

**Why a new port read.** No `Vcs` read counts lines, and `patch(base)` stages
the working tree into a temporary index, needs the worktree, and would count
the change folder's committed event logs. `diffStat(from, to, exclude)` runs
`git diff --numstat --no-renames <from>...<to>` with the openspec root
excluded. The three-dot form diffs from the merge base, so the count stays
the change's own work after a sync merged the default branch into the branch,
and still works after land because land keeps the `osq/` branch.

**Which gate runs count as "at archive".** The archiver re-runs each task's
`verify`, then the proposal's `verify`, then its `check:`, as `verify_ran`
events in the task streams and `change.jsonl`, then writes `validator_ran`,
then `archived`. Earlier per-task change verifies share the proposal's command,
so the model takes the last matching event at or before the last `archived`
event. Events after it, such as a land sync's `verify_ran` (whose `duration`
is in milliseconds, not seconds), are not archive gates; the sync shows as
`lastSync` instead. `check_ran` is no longer written since 125.

**Reuse.** Spec changes are `readArchivedChange(...).capabilities`, the
record behind `osq digest`'s per-change entry. Disclosures are
`readChangeDisclosures`. Landed state is `readDependencyState`. The last sync
and its stop are `readLastSync`. The halt is the change-level marker
`.run/regressed/change.md` that `recordLandStop` commits on the branch.

**Measured on 2026-10-06** in a scratch worktree at 152 with a rough cut (a
`diffStat` member on `Vcs`, `GitVcs` and `NoVcs`, a `land` field on
`SpecDetails` set for archived changes, a `Land:` section in `formatShowText`,
and a `land` field on `WebChange` set by `getWebChange`): both typechecks and
the build passed, and 3352 of 3353 tests passed. The one failure was
`tests/vcs-write.test.ts` "exposes exactly the intended members on the port",
which pins the `Vcs` member list; task 1 owns that test with
`tests.modify: true`.
