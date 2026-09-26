---
title: Human steps on the record
depends_on:
  - "072"
  - "073"
verify: pnpm verify
features:
  reads:
    - status-inspection
    - watcher-and-harness
    - cli-foundation
    - spec-lint-and-approve
    - metrics-and-reporting
    - web-inspection
---
## Goal

What a human must do around a change becomes part of the record. Steps before
approval appear in the digest and the inbox. After landing, a change with steps
or a check to run stays verification pending until someone records the outcome,
and changes that depend on it wait. One function answers what a change folder
needs next, and every surface prints its answer. Covers roadmap item 2.2.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests on temporary
projects prove that:

- steps before approval show in the digest and the inbox's approval item
- a change with after-landing steps archives, shows as verification pending,
  and holds its dependent in `depends_on` and in the queue
- `osq verified --passed` appends one event and frees the dependent, while
  `--failed` keeps it waiting and shows in the inbox
- `osq check` runs the check command and records its exit code and output
- a fresh template shows as unplanned, with planning as its next step, in the
  inbox, `osq status`, the plan handoff, and the approve refusal
- a change without after-landing steps or a check lands exactly as today

## Non-goals

- Holding the archive itself. ts-paas 008's MODIFIED requirements needed 007's
  ADDED ones in the living spec, so the archive still happens and only
  dependents wait.
- Running after-landing checks automatically.
- Editing anything already archived. Outcomes and check runs are appended
  events.
- Making changes archived before this one verification pending. Only an
  `archived` event that records a verification requirement makes a change
  pending, so older archives stay landed.
- A lint rule on `## Human steps`.

## Surface

- Added: `### Before approval` and `### After landing` under `## Human steps` (document sections)
- Added: `check` (proposal frontmatter field)
- Added: `osq check <id>` (command)
- Added: `osq verified <id> --passed|--failed [--note <text>]` (command)
- Added: `check_ran` and `verification_recorded` (event types)
- Changed: the `archived` event carries `verification` when a change needs it (event data)
- Added: `verification-pending` queue state, and `planning`, `verification-pending`, and `verification-failed` inbox kinds (state)
- Changed: `osq status`, `osq show`, the `osq plan` handoff line, and the `osq approve` refusal print the change's next step (output)
- Changed: a dependency that is verification pending no longer counts as landed (behavior)
- Changed: a fresh template shows as needing planning instead of `osq approve` (behavior)
- Added: `history.verification` in `osq report` (report field)

## Background

`## Human steps` is one section. `buildApprovalDigest` in
`src/core/spec/digest.ts` copies it whole through `extractSection` from
`src/core/spec/parser.ts`, whose pattern stops at the next `## ` heading and so
keeps `###` subsections inside. The watcher prints it at archive from
`readHumanSteps` in `src/watcher/loop.ts`; this change leaves that print alone.

`archiveSpecFolder` in `src/watcher/archiver.ts` appends the `archived` event
with `ArchivedEventData` from `src/harness/types.ts`. Human events such as
`rejected` are appended straight to `.run/events/change.jsonl` by core code, as
`appendRejectedEvent` in `src/core/lifecycle/reject.ts` does. The new events
keep their types in core too, so no task changes `src/harness/`. The shared command
runner is `runVerificationCommand` in `src/core/run/verification.ts`.

`isDependencyDone` in `src/core/status/state.ts` counts any archived folder as
met. `selectAssociation` in `src/core/status/queue-state.ts` derives every
archived association as `landed`, and `prepareQueuePlan` in
`src/core/status/queue-planning.ts` picks items by `row.unmetDependencies`,
which `readQueueState` builds from the landed set. So changing those two files
also changes `osq plan --next`. `state.ts` is 247 lines and `queue-state.ts` 246,
against the 250-line budget.

`projectNeedsYou` in `src/core/status/inbox.ts` offers `osq approve <id>` for
every unapproved change with a proposal, including a fresh template whose verify
is still `node -e "process.exit(0)"`. `analyzeVerifyCommand` in
`src/core/spec/linter.ts` recognizes that placeholder. `readInbox` in
`src/core/status/inbox-projection.ts` builds the inbox for both `osq` and the
web dashboard, whose `packages/ui/src/home/labels.ts` maps every needs-you kind
to a label in a `Record`, so a new kind needs a label there. `osq status`
prints from `formatStatusOverview` in `src/core/status/status.ts`. The plan
handoff line comes from `writePromptHandoff` in `src/cli/plan-queue.ts`, and
the approve refusal from the catch in `approveCommand` in `src/cli/approve.ts`.

Measured in a scratch worktree with a rough version of every surface: the only
test that pins changed behavior is `tests/inbox.test.ts`, whose fixture changes
use the placeholder verify and so become planning items. The plan handoff tests
assert exactly one line, so the next step goes on that same line.
`tests/inbox.test.ts` and `tests/inbox-stuck.test.ts` pin the JSON key order of
needs-you items, so new item fields appear only on the items that have them.
Both typechecks passed once the UI label map had the new kinds.

## Contract

### Requirement: Change next step
`readNextStep` SHALL return one state and the command that moves the change
forward.

#### Scenario: Fresh template
- **WHEN** a change created by `osq plan` still has the placeholder verify
- **THEN** its next step is `unplanned` with command `osq plan <id>`

### Requirement: Verification pending dependency
An archived dependency whose `archived` event records a verification
requirement SHALL stay unmet until its latest recorded outcome is `passed`.

#### Scenario: Passed outcome
- **WHEN** a human runs `osq verified 012 --passed` on a pending change
- **THEN** one `verification_recorded` event is appended and its dependents become eligible

## Human steps

None

## Delta

- `specs/status-inspection/spec.md`: modifies "Stable inbox object" and "Brief
  queue state projection"; removes "Explicit status remains complete"; adds
  "Change next step", "Next step commands", "Next step detail and format",
  "Verification state", "Verification pending dependency", "Explicit status
  with next steps", "Planning inbox items", "Verification inbox items", and
  "Show next step".
- `specs/watcher-and-harness/spec.md`: adds "Archived verification
  requirement" and "Human verification events".
- `specs/cli-foundation/spec.md`: adds "Check command", "Verified command",
  "Plan handoff next step", "Approve refusal next step", and "Planner human
  steps guidance".
- `specs/spec-lint-and-approve/spec.md`: adds "Human steps sections" and
  "Digest steps before approval".
- `specs/metrics-and-reporting/spec.md`: adds "After-landing verification
  counts".
- `specs/web-inspection/spec.md`: adds "Inbox kind labels".

Nine tasks; no file is shared. Task 1 owns `human-steps.ts`, `verification.ts`,
and `next-step.ts`, which later tasks import but do not change.
