---
title: A human can steer an approved change in its worktree after any task death
depends_on: []
verify: pnpm verify
features:
  reads: [metrics-and-reporting, version-control, watcher-and-harness]
---
## Goal

`osq plan <id>` reopens an approved change in its worktree only when a
steering trigger is active: a stuck or blocked task, a regression, or a
default-branch stop. A task that died for any other reason, such as
`timeout` or `undeclared_test_change`, has no trigger. When its plan is
what is wrong, the human has no way to fix it: `osq plan <id>` refuses with
"needs no steering", an edit in the worktree makes `osq retry` refuse
because the folder no longer matches its seal, and `osq approve <id>` takes
"Approval into a worktree" and fails with `branch osq/<folder> already
exists`. 301 task 3 hit this on 2026-10-23: its task file lacks
`tests.modify: true`, so every retry repeats the same death.

This change lets the human steer such a change. When an approved change in
an osq worktree has no steering trigger but has a dead task, `osq plan <id>`
opens steering with one `dead` trigger per dead task, and `osq approve <id>`
approves the revised plan in the worktree and retires each dead task as
`osq retry` does. The watcher, the inbox, land and auto-steer still read
only `deriveSteering`, so automatic retries are unchanged.

## Verify

`pnpm verify` runs the CLI and UI typechecks, the build, every test and
lint. It proves, on scratch repositories with a change in its worktree,
that `osq plan` writes the steering prompt for a dead task, that
`osq approve` seals the edited plan there and retires the dead task, that
the run then continues, and that every earlier steering, approve and
status test still holds.

## Non-goals

- New steering triggers in `deriveSteering`; the watcher, inbox, land and auto-steer do not change.
- `osq plan <id> --run` and the dashboard's Start planning button.
- A change in the checkout or with `vcs.enabled` off; there, editing the plan, `osq approve <id>` and `osq retry` already work.
- The Rust plan and approve features; a later queue item ports this.

## Surface

- Changed: `osq plan <id>` (command): reopens an approved change in its worktree that has a dead task and no steering trigger
- Changed: `osq approve <id>` (command): approves such a change's revised plan in its worktree and retires its dead tasks

## Decisions

- ADR 001: no config loading change.
- ADR 003: approval commits in the worktree through osq as steered approval already does; no human runs git.
- ADR 004: approval lints through the same pinned validator.
- ADR 005: no validator range change.
- ADR 006: the human steers the plan and taps approve; osq retires the dead task deterministically.
- ADR 010: no validator role change.
- ADR 012: no watch service change.
- ADR 015: the MCP tools are unchanged.
- ADR 018: `dead` is not a run steering trigger, so no automatic planner runs for it.
- ADR 019: the tapped planner keeps reading `deriveSteering` only.
- ADR 021: autopilot sees a dead task as before; only a human's `osq plan` and `osq approve` read the new triggers.

## Assumptions

- A dead task the human chose to steer needs no extra gate: the human already decides by running `osq plan <id>` and then `osq approve <id>`.
- Running `osq approve <id>` on such a change without editing its plan is harmless: it seals the same plan again and retires the dead task, as `osq retry` would.

## Contract

### Requirement: Steering after any task death

See `specs/status-inspection/spec.md`, with "Dead task steering";
`specs/cli-foundation/spec.md`, with "Planning a change that needs
steering"; and `specs/spec-lint-and-approve/spec.md`, with "Approval after
steering".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/status-inspection/spec.md`: ADDED "Dead task steering".
- `specs/cli-foundation/spec.md`: MODIFIED "Planning a change that needs steering".
- `specs/spec-lint-and-approve/spec.md`: MODIFIED "Approval after steering".
- No file is shared by two tasks.
