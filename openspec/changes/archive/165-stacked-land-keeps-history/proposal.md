---
title: A stacked change lands cleanly after its dependency lands
depends_on: ["164"]
verify: pnpm verify
features:
  reads: [spec-lint-and-approve, status-inspection, cli-foundation, watcher-and-harness, web-inspection]
---
## Goal

A change stacked on another (162 on 161) takes the default branch without
conflicts after its dependency lands, when nothing but the dependency and the
dependent changed the conflicting lines. The default branch keeps one commit per
landed change, and osq rewrites no history.

Today `osq land` writes the land commit with `commitTree` in
`src/core/vcs/git-vcs-land.ts`: the branch's tree with the default branch as its
only parent, so the default branch never holds the dependency's branch commits.
A stacked dependent's branch holds them, so when `syncWithDefaultBranch` in
`src/core/vcs/sync-main.ts` merges the default branch, git takes the old default
branch as the merge base, and every line the dependent changed on top of its
dependency conflicts. A trial on 2026-10-10 landing 161 and merging into 162
conflicted in four files, and a code conflict at land restarts the whole stack
above the landed change.

With this change, the sync reads the `Osq-Head` trailer that every land commit
already carries. When a landed tip shares history with the change's branch, the
sync merges a bridge commit instead of the default branch. The bridge holds the
default branch's tree, with the default branch and the landed tip as parents, so
git takes the landed tip as the merge base. The bridge exists only on the
dependent's branch; the land commit and the default branch's history are
unchanged.

A land-order deadlock goes too. When a dependency is steered and archives
again after its dependent archived, `assertNoEarlierChange` in
`src/core/vcs/land-checks.ts` refused to land the dependency because the
dependent archived first. The dependent cannot land before the dependency, and
`osq reject` refuses archived changes. The check now skips a change stacked on
the one being landed, and its refusal no longer suggests `reject`.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
`tests/vcs-stacked-land.test.ts` builds a three-change stack in a temporary
repository through `approveSpec` and `runWatcherOnce`, the way
`tests/stack-run.test.ts` does. Each change rewrites the same line, and the
test lands all three with `landChange`. On today's code the second land stops
with `002-b: src/one.txt conflict with main`. A trial of this plan in a scratch
worktree on 2026-10-10 landed all three, with `main` gaining three
single-parent commits.

## Non-goals

- Resolving real conflicts between unrelated changes, or between a dependent
  and the part of its dependency that changed after the dependent was cut.
  Those still stop and restart as today.
- Changing the land commit, `osq land`'s refusals other than "Land refusals"'s
  earlier-change refusal, or `osq land`'s output.
- Any change without `vcs.enabled`; sync and land need git already.

## Surface

- Changed: the `osq land` refusal `<other> archived before <folder> and also writes <capabilities>; land it first, or reject it` now ends `; land it first`, and is not raised for a change stacked on the one being landed.
- Added: `osq: <id> bridge <default branch>` commits on a stacked change's `osq/<folder>` branch, reached only through its sync commit.

## Decisions

None

## Assumptions

- Every land commit carries `Osq-Head` naming the branch tip it landed, as `buildSquashMessage` writes today. A default-branch commit without it, such as one merged by hand, is merged as today.
- A change's archived folder keeps the `.run/stacked-on` it was cut with; 162's archived folder on `osq/162-remote-cli-restarted-1` holds `161-osq-server <hash>`.
- In a clone that lacks a landed tip, as a server's clone may, the sync merges the default branch as today, and a stacked change may still conflict there.

## Contract

### Requirement: Sync takes landed branch tips

The sync SHALL merge a bridge commit holding the default branch's tree, with
the landed tips that share history with the change's branch as extra parents,
in place of the default branch, whenever such a tip exists.

#### Scenario: Three-change stack lands in order
- **WHEN** `001` changes line 1 of `src/one.txt`, `002` is stacked on `001` and changes the same line again, `003` is stacked on `002` and changes it once more, all three archived, and `osq land 001`, `osq land 002` and `osq land 003` run in that order
- **THEN** each land exits zero, `src/one.txt` on the default branch holds `003`'s line, and the default branch gained exactly three commits, each with one parent

### Requirement: Land refusals

A change stacked on the change being landed SHALL not refuse its land.

#### Scenario: Earlier change stacked on this one
- **WHEN** `002`'s archived `.run/stacked-on` names `001`, both write `orders`, neither has landed, `002`'s `archived` event is earlier than `001`'s, as after `001` was steered and archived again, and `osq land 001` runs
- **THEN** it lands `001`, and `osq land 002` then lands `002`

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` so `osq` and the watch service use the bridge; until then they sync as before.

## Delta

- `specs/version-control/spec.md`: adds "Vcs history reads" and "Sync takes landed branch tips"; modifies "Vcs land operations" (`commitTree` takes optional extra parents), "Default branch sync" (step 2 merges what "Sync takes landed branch tips" names; no other word changes) and "Land refusals" (the stacked skip and the shorter refusal). Every existing scenario is kept; only "Earlier change shares a capability" changes its THEN to the shorter refusal.

Three tasks, in order. Task 1 adds the port reads and extra parents. Task 2
adds the bridge to the sync, using task 1's port. Task 3 changes the land
refusal. No file is shared between tasks.

A trial of all three in a scratch worktree on 2026-10-10 broke only
`tests/vcs-write.test.ts` (the port member list), `tests/vcs-land-refusals.test.ts`
(the refusal text) and the line budget (`src/core/vcs/git-vcs.ts` reached 263
lines); tasks 1 and 3 scope those.

## Background

**Why a bridge, not a second parent on the land commit.** Giving the land
commit the branch tip as a second parent also makes later syncs clean, with a
one-line change. But it puts every task, approval and sync commit of every
change on the default branch and on origin: in the trial, `main` went from 5
commits to 12 for three changes. Bisect and revert on the default branch would
then cross task commits, and because osq never rewrites history, that could not
be undone. The bridge keeps the default branch as it is and touches only the
dependent's branch. If it picks no tip, the sync is today's sync.

**Which tips are kept.** A landed tip is kept only when its merge base with the
change's branch is not already on the default branch, that is, when the two
share commits the default branch lacks. An unrelated change shares only default
branch history with any landed tip, so it keeps none and merges the default
branch exactly as today, and its sync commit's second parent is still the
default branch's tip.

**Steered dependency.** When the dependency changed after the dependent was
cut, its landed tip still descends from the commits the dependent holds, so
the merge base is the dependent's copy of the dependency. Only the dependency's
later work counts as the other side, and a real overlap with it still
conflicts and restarts.
