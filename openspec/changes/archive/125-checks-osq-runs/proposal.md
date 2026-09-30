---
title: Checks after landing are commands osq runs, and nothing waits on a human's word
depends_on: [126]
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - traceability
---
## Goal

osq never records a human's claim as verification (ADR 006 decision 3).
Today a proposal with `### After landing` steps or a `check:` command
archives as verification pending. Its dependents wait, and the queue and
inbox show it, until a human types `osq verified <id> --passed`. osq cannot
check that claim, and across 107 archived changes it was recorded twice.

After this change a proposal's `check:` command is a gate osq runs. The watcher
runs it after the change-level verify at archive, and `osq land` runs it again
when its sync merges a newer default branch. A failed check stops the change
exactly as a failed verify does, before the default branch moves. After-landing
steps are notes: `osq show` and the inbox's land card print them, and nothing
waits on them. `osq verified`, `osq check`, and the verification-pending state
go.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests run a change with a
`check:` through archive and through a land's sync, pass and fail. They show
that no command, queue state, inbox item, card key, report line, or dependency
wait is left for a human verification, and that `osq show` prints
after-landing notes and still prints the verification events of an older
archive.

## Non-goals

- A human sign-off before merge, such as a business approval of a PR preview.
  That belongs to a future PR land mode as the land decision itself, a tap
  before the merge, not as a record after it (ADR 006 decisions 2 and 7).
- Approval flags that print and approve anyway (ADR 006 decision 4). Deciding
  which flags become lint errors needs each flag's history across the archive,
  so it is a change of its own.
- A new steering trigger for a failed check. It ends like a failed verify:
  `osq retry <id> change` at archive, or the land's sync stop. The
  steering-triggers queue item turns every stop into "plan it".
- Human steps before approval. They stay.
- Removing `VerificationRequirement` from `src/core/spec/human-steps.ts`,
  which spec-lint-and-approve owns. It is left unused, and
  `inert-module-cleanup` removes it.

## Surface

- Removed: `osq verified <id>` (command)
- Removed: `osq check <id>` (command)
- Removed: `verification-pending` (next-step state and queue state)
- Removed: `verification-pending` and `verification-failed` (inbox needs-you kinds)
- Removed: `verify` (dispatch item kind), with its card and its `c`, `p`, and `f` keys
- Removed: `Verification pending:` (section of `osq status`)
- Removed: `After-landing checks:` (report line) and `history.verification` (report JSON key)
- Removed: `verification` (key of the `archived` event's data)
- Changed: `check:` (proposal frontmatter) runs after the change-level verify at archive and in a land's sync; a failure is a `verify_red` change regression or a `sync_failed` stop
- Changed: `Verification:` (section of `osq show`) prints only for an archive whose events hold `check_ran` or `verification_recorded`
- Added: `After landing:` (section of `osq show`) and `afterLanding` (its JSON key)
- Added: `check:` and `after landing:` (lines of the inbox's land card)

## Decisions

- ADR 001: unchanged; no config loading moves.
- ADR 002: archive still merges deltas without a model. The check runs against the merged tree after the change-level verify, and a failed check puts the living specs back as a failed verify does.
- ADR 004: unchanged; no validator call moves.
- ADR 005: unchanged; no validator call moves.

## Background

**Where the check runs.** The brief asked whether the check runs in the
worktree before the fast-forward or in the checkout after it. A server has no
checkout, and a check after the fast-forward could only report a main that has
already moved. So the check always runs before the default branch moves. It is
a second change-level command next to the proposal's `verify`, and it runs
wherever that verify runs:

- At archive, through `verifyArchiveStep`, in the worktree or, with
  `vcs.enabled` off, in the project root. `vcs.enabled` defaults to off, so a
  check that ran only in `osq land` would never run in a default project.
- In `osq land`'s sync, through `runSyncVerify`, when the default branch has
  moved since the branch was cut. When it has not moved, the tree the land
  commits is the tree the archive checked.

**A failed check.** It blocks like a failed verify, through paths that exist
today. At archive it writes `.run/regressed/change.md` with reason
`verify_red` and puts the living specs back, and the human runs
`osq retry <id> change` once the cause is fixed. In a sync it is a `sync_failed`
stop that leaves the worktree as it was, and the human runs `osq land <id>`
again. Its result is a `verify_ran` event, as a verify's is. No new event type
is needed.

**Old archives.** Their `archived` events keep the `verification` key, and
their `check_ran` and `verification_recorded` events stay in
`.run/events/change.jsonl`. Nothing reads the key, and `osq show` still prints
the events. An archive that was verification pending, such as 124, now reads as
landed, and its dependents run.

**Measured fallout.** The whole change was applied roughly in a scratch
worktree on 2026-09-30 and run through both typechecks, lint, and the full suite,
UI tests included. Then it was replayed one task at a time in this order.
Every test that failed is in its task's `scope`:

| Task | Tests it changes |
|---|---|
| 1 | `verification-record`, `command-error-verification`, `osq-change-env` |
| 2 | none |
| 3 | `dispatch-cards`, `dispatch-items`, `dispatch-keys`, `dispatch-order`, `inbox-next-step` |
| 4 | `next-step`, `show-next-step`, `verification-dependents` |
| 5 | `report-verification` |
| 6 | `human-steps-guidance` |

Tasks 1 and 5 delete the modules and tests they remove. That needs 126,
which lets a task delete a file its scope names; before it, the watcher's
guard reported every such deletion as a `scope_violation`. Hence
`depends_on: [126]`.

Task 2 comes after task 1 because the `osq check` and `osq verified` tests
archive a change and then need its `verification` key, which task 2 stops
writing. `src/core/report/report-inbox-wait.ts` has 248 lines, and task 3 keeps
it at or under 250. `src/core/vcs/sync-main.ts` has 249 lines, so task 2
reads the check in `sync-verify.ts` instead. No requirement this change
removes is pinned in `tests/living-specs-delta-equivalence.test.ts`.

## Contract

### Requirement: A check is a gate osq runs
A proposal's `check:` command SHALL run after the change-level verify at
archive and after the verify in a land's sync, and a failure SHALL stop the
change there, as a failed verify does.

#### Scenario: Check fails at archive
- **WHEN** a change's verify passes and its `check: node check.cjs` exits 1
- **THEN** the change stays unarchived with a `verify_red` change regression naming `node check.cjs`

### Requirement: Nothing waits on a human's verification
No command, next step, queue state, inbox item, card key, report line, or
dependency SHALL record or wait for a human's verification. After-landing steps
SHALL be notes that `osq show` and the land card print.

#### Scenario: Archived change with after-landing steps
- **WHEN** a change with `### After landing` steps archives
- **THEN** its next step is `landed`, its dependents run, and the inbox has no item for it

## Human steps

### Before approval

- Approve 125 only after 126 has landed through `osq land 126`. The watcher
  runs the build on `main`, so a run stacked on 126's unlanded branch would
  still use the old guard and kill tasks 1 and 5 on their deletions.

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Command error streams" and "No command records a verification"; modifies "Planner human steps guidance"; removes "Check command", "Verified command", and "Command error output".
- `specs/watcher-and-harness/spec.md`: adds "Change check at archive" and "Archived event without a verification requirement"; modifies "Change folder in verify environment" and "Role environments"; removes "Archived verification requirement" and "Human verification events".
- `specs/version-control/spec.md`: modifies "Default branch sync".
- `specs/status-inspection/spec.md`: modifies "Stable inbox object", "Brief queue state projection", "Change next step", "Next step commands", "Next step detail and format", "Explicit status with next steps", "Show next step", "Dispatch items", "Dispatch order", "Dispatch cards", and "Card keys"; adds "Show after-landing notes"; removes "Verification state", "Verification pending dependency", and "Verification inbox items".
- `specs/web-inspection/spec.md`: modifies "Inbox kind labels".
- `specs/metrics-and-reporting/spec.md`: adds "Report without verification counts"; removes "After-landing verification counts".

Six tasks, in order. No file is shared between tasks. Each task leaves the
tree compiling and `pnpm verify` green on its own, which the replay above
checked.
