---
title: Status and queue call a change landed only when main holds it
depends_on: []
verify: pnpm verify
features:
  reads: [spec-lint-and-approve, version-control, metrics-and-reporting, watcher-and-harness]
---
## Goal

With `vcs.enabled`, `osq show`, `osq status`, `osq queue`, bare `osq` and the
dashboard call a change landed only when the default branch holds it. An
archived change that has not landed says so and names `osq land <id>` as its
next step.

Today `readArchivedNextStep` in `src/core/status/next-step.ts` returns
`landed` for every archived change that needs no steering, and
`selectAssociation` in `src/core/status/queue-state.ts` maps any archived
queue association to `landed`, without asking git. On 2026-10-10 `osq show
160` printed `Next: landed` while main stopped at 159, `osq queue` showed
remote-cli and local-mcp as landed, and 160 to 163 sat archived for a day with
nothing pointing at `osq land`. `readDependencyState` in
`src/core/spec/stack-dependencies.ts` already tells `landed` from `archived`
with git; `osq land`, `findLandCandidates` and the land view use it. This
change uses it in the next step and the queue too.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
tests build temporary git repositories with `vcs.enabled`, a change archived on
an `osq/<folder>` worktree branch, and then the same branch merged into
`main`, the way `tests/land-view.test.ts` does in `setupWorktreeProject`. They
check `readNextStep`, `osq show`, `getStatusOverview` and `osq status` text,
`projectQueue`, `formatQueue` and `prepareQueuePlan`, and `readInbox`,
`formatInboxText` and the dashboard label, before and after the merge.

## Non-goals

- Changing what `osq land` does, or how `readDependencyState` and
  `findLandCandidates` decide.
- Any change without `vcs.enabled`: archived stays the end state, and no new
  git read happens.
- The `Landed since last look` group of bare `osq`. It reads the checkout's
  archive directory, which with `vcs.enabled` holds only changes `main` holds.
- The `osq inbox` dispatcher, which already offers a land card.
- The web change document. Its Land panel already reads the landed state
  from `readLandView`.

## Surface

- Added: `archived` next-step state, with detail `not landed` and command `osq land <id>`, in `osq show` (`Next: archived (not landed) — osq land <id>`), its `--json` `next`, and the `osq plan` and `osq approve` handoff lines.
- Added: `Not landed:` section in `osq status`, one `  <id>: <title> — osq land <id>` line per change, after `Archived specs:`.
- Added: `archived` queue item state in `osq queue` (`[archived]`) and the queue report's items.
- Changed: the queue's landed count and queue dependencies count only changes the default branch holds.
- Added: `change-archived` needs-you kind in bare `osq` and `osq --json`, text row `  <id>: <title> — archived, not landed — osq land <id>`, and its dashboard label `not landed`.
- Changed: README's "Human Attention Inbox" Needs you bullet names archived changes waiting to land.

## Decisions

- ADR 003: osq only reads git here; nothing new writes to git, and landing stays `osq land`, which the human runs.
- ADR 001: no config key is added; the existing `vcs.enabled` is read from the jiti-loaded config.
- ADR 004: no validator call is added or moved.
- ADR 005: no validator call is added or moved.
- ADR 010: the validator role is untouched.
- ADR 012: the watch service is untouched; only read commands change.
- ADR 015: `osq mcp`'s tools are untouched; its `spec` and `query` tools print what they printed.
- ADR 013: the dashboard only labels the new inbox kind; no write path or HTTP route changes.
- ADR 014: the server runs the same command functions on its own clone, so `osq status`, `osq queue` and the inbox read its clone's default branch, and forwarded commands print the same lines.

## Assumptions

- An archived queue item that has not landed no longer satisfies a queue dependency, so `osq plan --next` waits for `osq land` before it picks an item that depends on it.
- In the queue, `osq status` and the inbox, the changes waiting to land are the ones `findLandCandidates` finds: changes archived in an osq worktree whose branch `main` does not hold. An archived change whose worktree was removed without landing shows `archived` in `osq show` but is not listed.

## Contract

### Requirement: Landed next step reads the default branch

With `vcs.enabled` and git, an archived change that needs no steering SHALL be
`landed` only when `readDependencyState` reads it as `landed`, and `archived`
otherwise.

#### Scenario: Archived change the default branch does not hold
- **WHEN** with `vcs.enabled`, change 007 archived in its worktree on branch `osq/007-pricing`, and `main` does not hold `openspec/changes/archive/007-pricing`
- **THEN** its next step is `archived` with command `osq land 007` and detail `not landed`

#### Scenario: Archived change without version control
- **WHEN** `vcs.enabled` is not set and the project is a git repository whose default branch does not hold archived change 007
- **THEN** its next step is `landed` with a null command

### Requirement: Changes waiting to land in status

With `vcs.enabled`, `osq status` SHALL list every archived change that has not
landed under `Not landed:`, each with `osq land <id>`.

#### Scenario: Archived changes that have not landed
- **WHEN** with `vcs.enabled`, changes 007 `Pricing` and 009 `Billing` archived in their worktrees, `main` holds neither, and change 008 archived and merged into `main`
- **THEN** `osq status` prints `Not landed:`, then `  007: Pricing — osq land 007`, then `  009: Billing — osq land 009`, directly after `Archived specs:`, and no line for 008

### Requirement: Brief queue state projection

With `vcs.enabled` and git, an archived queue association the default branch
does not hold SHALL derive as `archived` and SHALL NOT satisfy a dependency.

#### Scenario: Archived queue item not on the default branch
- **WHEN** with `vcs.enabled`, queue item `alpha` is associated with change 007, archived in its worktree on `osq/007-alpha`, `main` does not hold it, and queue item `beta` depends on `alpha`
- **THEN** `osq queue` prints `alpha` with `[archived] change: 007`, `beta` lists `unmet: alpha`, the projection's `landedCount` does not count `alpha`, and `osq plan --next` does not select `beta`

### Requirement: Human attention inbox projection

Bare `osq` SHALL list each archived change that has not landed under
`Needs you` with `osq land <id>`.

#### Scenario: Archived change waiting to land
- **WHEN** with `vcs.enabled`, change 007 `Pricing` archived in its worktree, `main` does not hold it, and it needs no steering
- **THEN** `osq --json` holds one needs-you item `{ kind: "change-archived", change: { id: "007", title: "Pricing" }, task: null, command: "osq land 007" }`, and its text row under `Needs you` is `  007: Pricing — archived, not landed — osq land 007`

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` so `osq` and the watcher use the new states; until then they run the old build.

## Delta

- `specs/status-inspection/spec.md`: adds "Landed next step reads the default branch" and "Changes waiting to land in status"; modifies "Change next step", "Next step commands", "Next step detail and format", "Explicit status with next steps", "Brief queue state projection", "Human attention inbox projection" and "Stable inbox object". Every existing scenario is kept word for word.
- `specs/web-inspection/spec.md`: modifies "Inbox kind labels".
- `specs/cli-foundation/spec.md`: adds "README names changes waiting to land".

Three tasks, in order. Task 1 adds the `archived` next step and the status
overview's `notLanded`. Task 2 adds the `archived` queue state. Task 3 projects
`notLanded` into the inbox, labels it on the dashboard, and updates README; it
reads task 1's `notLanded` field. No file is shared between tasks.

A trial of all three tasks in a scratch worktree on 2026-10-10 passed every
existing test unchanged (3,712 and 152). The tests that pin `Next: landed` and
`[landed]` run without `vcs.enabled`, so none changes.

## Background

**One way to decide landed.** `readDependencyState` reads `landed` when the
default branch holds `<archive>/<folder>`. The next step calls it for one
archived change. `osq status` and the inbox reuse `findLandCandidates`, which
calls it only for changes archived in an osq worktree, so `osq status` costs
a few git reads, not one per archived change in the repository.

**Why only with `vcs.enabled`.** Without it, changes archive in the checkout
and the human commits them, so there is no branch to land. `findLandCandidates`
has a git-status fallback for that case, used by the `osq inbox` dispatcher;
this change does not use it, so those projects see exactly what they see
today.
