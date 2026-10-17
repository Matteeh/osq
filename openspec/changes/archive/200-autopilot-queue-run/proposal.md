---
title: With autopilot on, the watcher plans, approves, runs and lands every approved queue item in order
depends_on: ["199"]
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
    - spec-lint-and-approve
    - version-control
---
## Goal

ADR 021 decided an opt-in autopilot: a human approves the queue once, and osq
plans, approves, runs and lands each approved item in order. This change
builds it, without recovery, which is `autopilot-recovery`.

`osq queue approve` records the hash of every queue item in
`openspec/.run/queue-approval.md`, and `osq queue` shows which items it
covers. With `autopilot.enabled` in `osq.config.ts`, the watcher works the
first queue item that has not landed after each cycle, one step a pass:
`osq plan --next` creates its change, `osq plan <id> --run` starts the planner
of ADR 019, `osq approve <id>` approves a `ready` plan, the watcher runs the
tasks as always, and `osq land <id>` lands the archive. Each step calls the
command function itself, which the CLI hands to the watcher. A change
autopilot creates holds `.run/autopilot.md`, which names the item and the
queue approval it ran under and travels into the archive.

When a step needs a human, such as an unapproved or edited item, a planner
outcome other than `ready`, a refused approve, a halted change or a land that
stops, the watcher writes one stop record, `openspec/.run/autopilot-stop.md`,
with the reason and the one command that resumes the queue. `osq inbox`,
`osq status` and the dashboard show it. The queue stays stopped until a human
changes the state it stopped on or runs `osq queue approve`. All state is in
files, so turning autopilot off or restarting the watcher loses nothing.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree,
including the new `tests/autopilot-config.test.ts`,
`tests/queue-approval.test.ts`, `tests/autopilot-step.test.ts`,
`tests/autopilot-run.test.ts`, `tests/autopilot-inbox.test.ts` and
`tests/ui-autopilot-stop.test.tsx`, the end-to-end run of a three-item queue
with the mock harness among them, and the line and function budget tests over
every file the change touches.

## Non-goals

- Recovery: retrying, steering or healing a halted change under autopilot.
  `gates.autoRetries` works as today; a change that stays halted stops the
  queue. That is `autopilot-recovery`.
- `autopilot.maxSteers` and any other autopilot key besides `enabled`.
- Publishing to `origin`. Autopilot lands as `osq land <id>` does locally; the
  server's own land action keeps publishing.
- Forwarding `osq queue approve` to a server; with `OSQ_SERVER` set it refuses.
- Parallel changes, notifications beyond the inbox, and new events.
- Turning autopilot on in osq's own `osq.config.ts`.

## Surface

- Added: `autopilot.enabled` (config key, default `false`)
- Added: `osq queue approve` (command)
- Added: `openspec/.run/queue-approval.md` (record `osq queue approve` writes)
- Added: `openspec/.run/autopilot-stop.md` (record the watcher writes when autopilot stops)
- Added: `.run/autopilot.md` (marker in a change autopilot creates)
- Added: stop reasons `queue_unreadable`, `not_approved`, `changed_since_approval`, `rejected`, `plan_refused`, `planner_not_ready`, `approve_refused`, `halted` and `land_stopped`
- Added: inbox needs-you kind `autopilot-stopped` and its field `autopilotStopped: { reason, item, change, detail }`
- Changed: `osq queue` prints an approval line and one approval word per item when a queue approval exists
- Changed: `osq status` prints one line for an autopilot stop
- Changed: the dashboard's home view labels an autopilot stop `autopilot stopped` and shows its reason

## Decisions

- ADR 001: the `autopilot` block loads through the existing config loader.
- ADR 002: archive and delta application are not touched.
- ADR 004: lint runs inside `osq approve` as it does for a human.
- ADR 005: the OpenSpec peer range is not touched.
- ADR 010: the validator runs at archive as always and never stops the queue.
- ADR 012: autopilot's state is in files, so the watch service may restart the watcher between passes, including after a land rebuilds osq.
- ADR 013: no server route or write action changes; the dashboard reads the stop from the inbox document.
- ADR 015: `osq mcp` is not touched.
- ADR 018: the steering planner is not touched; a halted change stops the queue.
- ADR 019: autopilot starts its planner through `osq plan <id> --run`, detached, in a scratch worktree, and reads the outcome from `.run/plan-run.md`.
- ADR 020: the home view's link and reason come from a pure model file; the component only renders.
- ADR 021: this change builds decisions 1 to 7, 9 and 10 for one change at a time; decision 8's recovery comes with `autopilot-recovery`, and a usage-limit pause makes autopilot wait.

## Assumptions

- The approval and stop records live in `openspec/.run/`, untracked unless a human commits them. Checked on 2026-10-16: `osq land` refuses only uncommitted files the land writes, approve only those inside a task's scope, and no code lists the entries of `openspec/` itself; `osq status`, `osq queue` and `osq doctor` behaved with such a folder present.
- Autopilot plans an item only through `osq plan --next`, so the queue budget still applies. A project without `queue.maxPlanningSessions` and `queue.maxPlanningCost` stops at its first item with `plan_refused`. osq's own config sets both.
- Autopilot approves only the plan its own planner left: a `ready` record whose hash still matches. A change without the marker, or one a human edited after the planner ran, waits for the human.
- In tests, the planner runs through the same `osq plan <id> --run` command in its worker role, in process, with the mock adapter; the detached start is covered by change 194's tests.
- Measured on 2026-10-16 in a scratch worktree with a draft of the config block, the `queue approve` registration and the new inbox kind: `config.ts` reaches the budget only after the `validatedPlanner` lines collapse to one and one blank line goes, and `inbox.ts` only after `showCommand` is inlined. With those, both typechecks, lint, the line, function and import budgets and 642 related tests passed; the three that failed needed a dashboard build the scratch tree lacked.

## Contract

The deltas below are the contract.

## Human steps

### Before approval

None

### After landing

- Update the Notion roadmap: autopilot runs a queue; `autopilot-recovery` is next.
- To run osq's own queue unattended, set `autopilot: { enabled: true }` in `osq.config.ts`, run `osq queue approve`, and restart the watcher.

## Delta

- `specs/cli-foundation/spec.md`: ADDED "Autopilot configuration" (task 1), "Queue approve command" (task 2), "Autopilot commands" (task 4).
- `specs/status-inspection/spec.md`: ADDED "Queue approval record", "Queue view shows the approval", "Autopilot stop record" (task 2), "Autopilot change marker", "Autopilot next step" (task 3), "Autopilot stop in the inbox", "Autopilot stop in status" (task 5).
- `specs/watcher-and-harness/spec.md`: ADDED "Autopilot pass", "Autopilot stops", "Autopilot stop holds" (task 4).
- `specs/web-inspection/spec.md`: ADDED "Autopilot stop on the home view" (task 6).

No file is shared between tasks.
