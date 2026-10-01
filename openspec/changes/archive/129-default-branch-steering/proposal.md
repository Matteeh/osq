---
title: A change the default branch stops also ends at plan it, archived or not
depends_on: ["128"]
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
    - web-inspection
---
## Goal

128 made a stuck, blocked, or regressed task end at one action: `osq plan
<id>`, then `osq approve <id>`, and the run goes on. ADR 006 decision 5 also
lists triggers that involve the default branch, and those still end
somewhere else. A sync before the first task or before archive halts the
change with `sync_conflict` or `sync_failed` and tells the human to merge by
hand or to reject and replan. A requirement the change rewrites that moved on
the default branch also stops as `sync_failed`. `osq land` of an archived
change that conflicts, goes red after the merge, or finds a changed
requirement prints the stop and records nothing. `osq reject` refuses archived
changes and the watcher no longer runs them, so the change has no way out
inside osq. On 2026-09-29 a human fixed 112 by hand in its worktree.

Replanning tasks alone cannot answer these. The branch still lacks the
default branch's commits, so the next sync stops the same way. After this
change, a conflict, a changed requirement, and a red verify or check after
osq merges the default branch are steering triggers. Each gets its own stop
reason. The watcher halts an active change with it, and `osq land` commits
the stop on an archived change's branch. The inbox shows the change once with
`osq plan <id>`. Approving the revised plan brings the branch up to the
default branch:

- After a conflict, approval restarts the branch from the default branch's
  tip. It keeps the old branch under a new name, and every task runs again.
  Nothing commits conflict markers, and no executor resolves a conflict.
- After a changed requirement or a red merge, approval reopens an archived
  change on its branch, merges the default branch without running verify,
  and keeps done tasks. The revised plan's new task makes the merged tree
  pass, and the archive's re-run of every task verify judges the rest. A
  revised requirement is judged against the default branch's current text,
  and the next sync compares from there.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests derive the new
triggers and stop reasons, halt a watcher run on a red merge before archive,
record a land's stop on the branch and refuse the next land, show an archived
change that needs steering in the inbox, the dispatcher, and its next step,
write the steering prompt into an archived folder with the default branch's
requirement text, and approve both ways in temporary repositories. A restarted
change runs every task again and lands. A reopened change runs only its new
task and archives.

## Non-goals

- An AI resolver for code conflicts. It waits until sync data shows conflicts
  are common and mechanical. A restart never asks an executor to resolve one.
- The UI action and notifications.
- `osq sync <id>` on request. It still records `sync_stopped` and halts
  nothing; its stops just carry the new reasons.
- A stop with reason `sync_failed`, such as a failed `vcs.prepare` or a commit
  a hook rejected. It is not a trigger and keeps `osq retry <id> change`.
- Keeping done tasks across a restart. A conflict means the default branch
  changed code a task wrote, so its verify no longer proves anything about the
  new base.

## Surface

- Added: `requirement_changed` and `sync_verify_red` (reasons of a sync stop and of `.run/regressed/change.md`)
- Added: `conflict` and `requirement_changed` (steering triggers in `steering.trigger`)
- Added: `.run/requirements-base` (marker approval writes; the sync's requirement check reads it before `.run/base`)
- Added: `osq: <id> land stopped`, `osq: <id> replanned` (commit subjects on `osq/<folder>`)
- Added: `osq/<folder>-restarted-<n>` (kept branch after a restart)
- Added: `  Restarted from <default branch>; kept the old branch as osq/<folder>-restarted-<n>` and `  Merged <default branch> into osq/<folder>` (lines of `osq approve` output)
- Added: `<folder> needs steering: <trigger>; run osq plan <id>` (refusal of `osq land`)
- Changed: a sync's conflict stop says to run `osq plan <id>` instead of merging by hand, and its changed-requirement stop says to run `osq plan <id>` instead of rejecting
- Changed: a red verify or check after a sync's merge stops with `sync_verify_red` instead of `sync_failed`, and a changed requirement with `requirement_changed`
- Changed: `osq land` commits a conflict, changed-requirement, or red-merge stop on the change's branch
- Changed: an archived change that needs steering shows a needs-you item and a `halt` dispatch item with `osq plan <id>` instead of a `land` item, and its next step is `dead (needs steering) — osq plan <id>`
- Changed: `osq plan <id>`, `osq lint <id>`, and `osq approve <id>` find an archived change in a worktree that needs steering

## Decisions

- ADR 002: archive still merges deltas without a model. A reopened archived change gets the default branch's living specs back, and its next archive applies its deltas again.
- ADR 004: approval after a default-branch trigger lints with the pinned OpenSpec validator from the checkout, with the folder read where it is, as 128's approval after steering does.
- ADR 005: unchanged; the validator range check runs as before.
- ADR 001: unchanged; no config loading moves.

## Background

**The triggers.** All three new triggers come from markers, so state stays
derived from files:

- `conflict`: `.run/regressed/change.md` with reason `sync_conflict`.
- `requirement_changed`: the same marker with reason `requirement_changed`.
  This replaces `sync_failed` for the sync's step 1.
- `regression` with reason `sync_verify_red`: a red verify or check after the
  sync's merge. This replaces `sync_failed` for step 5.

The watcher already writes the marker when its sync stops, and 128's skip then
leaves the change alone. `osq land` runs from the checkout, but the archived
folder lives on the branch, so land commits the marker there as
`osq: <id> land stopped`. That keeps the worktree clean, puts the evidence
with the change, and needs no second place for status to read. The next land
refuses until the change is steered.

**Restart or merge.** A merge whose conflict a task resolves would commit
conflict markers to the branch and make an executor the conflict resolver,
which the brief puts out of scope. A restart re-cuts `osq/<folder>` from the
default branch's tip, as a first approval does. It renames the old branch
aside, as a rejected branch is renamed to `-rejected-<n>`, so no history is
rewritten. Before that, approval commits the revised folder on the old branch
as `osq: <id> replanned`, which keeps the record and lets the worktree be
removed cleanly. The default-branch triggers other than a conflict have no
conflict to resolve, so approval merges with the sync's own code and
`skipVerify`. If that merge conflicts after all, approval restarts instead.

**Done tasks after a merge.** A sync otherwise runs only before the first task
or before archive. A merge at approval comes between tasks, so the next
task's scope audit would count osq's own merge as a regression of every done
task whose files the default branch touched. Approval therefore refreshes
those done markers' scope hashes with `refreshRecertifiedDoneMarker`, and the
archive still re-runs every task verify.

**Requirements base.** The sync compares each rewritten requirement between
`.run/base` and the default branch's tip. After a revised plan is approved
against the current text, that comparison would stop on the same requirement
forever. Approval writes `.run/requirements-base` with the tip it judged
against, and the check reads it before `.run/base`. `.run/base` stays the
commit the branch was cut from, which the `Osq-Base` trailer reports.

**Measured fallout.** Tasks 1 and 2 were applied roughly on 128's tip and run
through both typechecks, the build, and the full suite against a clean
baseline (2886 tests, all passing). Six tests failed, all on stop messages and
reasons task 1 changes: `tests/vcs-sync.test.ts`,
`tests/vcs-sync-active.test.ts`, `tests/vcs-land.test.ts`, and
`tests/change-check.test.ts`. Recording a land's stop on the branch broke
nothing. Tasks 3 to 5 add paths for archived changes and default-branch
triggers that no existing test reaches. No requirement is removed, so
`tests/living-specs-delta-equivalence.test.ts` needs no change.
`src/core/vcs/sync-main.ts` has 249 lines, so task 1 moves its file helpers
into `sync-files.ts`. `land.ts` has 225, so task 2 puts recording in
`land-stop.ts`. `src/core/status/inbox.ts` has 245, so task 3 adds archived
items in `inbox-projection.ts`.

## Contract

### Requirement: A default-branch stop ends at plan it
A conflict, a changed requirement, and a red verify or check after osq merges
the default branch SHALL each mark the change as needing steering, whether
the watcher's sync or `osq land` stopped it, and its inbox item SHALL command
`osq plan <id>`.

#### Scenario: Conflict at land
- **WHEN** `osq land <id>` stops on a code conflict
- **THEN** the branch holds the stop, the inbox shows the change once with `osq plan <id>`, and the next `osq land <id>` refuses until it is steered

### Requirement: Approval brings the branch up to the default branch
Approving the revised plan of a change stopped by the default branch SHALL
leave its branch holding the default branch's tip. After a conflict it SHALL
restart the change from the default branch and keep the old branch. Otherwise
it SHALL merge the default branch and keep done tasks. Either way the run
SHALL continue.

#### Scenario: Restart after a conflict
- **WHEN** an archived change's land stopped on a conflict, and its revised plan is approved
- **THEN** `osq/<folder>` is cut from the default branch's tip, the old branch is kept as `osq/<folder>-restarted-1`, every task runs again, and the change lands

#### Scenario: Merge after a red verify
- **WHEN** an archived change's land stopped with `sync_verify_red`, and a revised plan that adds a task is approved
- **THEN** the change is active on its branch with the default branch merged, its done tasks stay done, and only the new task runs before it archives

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: adds "Land records a steering stop"; modifies "Default branch sync", "Land refusals", and "Land from the verified tree".
- `specs/watcher-and-harness/spec.md`: modifies "Watcher sync".
- `specs/status-inspection/spec.md`: adds "Archived change that needs steering"; modifies "Steering triggers", "Change next step", and "Dispatch items".
- `specs/spec-lint-and-approve/spec.md`: adds "Approval after a default-branch trigger"; modifies "Approval after steering" and "Lint finds a change in any tree".
- `specs/cli-foundation/spec.md`: modifies "Planning a change that needs steering" and "Steering guidance".

Six tasks, in order. No file is shared between tasks. Each later task uses
what an earlier one exports, and reads it without changing it.
