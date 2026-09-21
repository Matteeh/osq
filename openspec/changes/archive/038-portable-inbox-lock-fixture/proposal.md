---
title: Portable inbox lock fixture
depends_on: ["037"]
verify: pnpm verify
features:
  reads:
    - status-inspection
---
## Goal

Make the bare-CLI inbox integration suite pass from a clean checkout by having
test setup materialize the ignored runtime directory before it writes a live
lock marker.

## Verify

`pnpm verify`

The suite runs the inbox integration test from tracked repository state and
proves that its live-lock setup does not depend on ignored files or empty
directories left in a developer worktree.

## Non-goals

- Changing inbox projection, rendering, cursor, or CLI behavior.
- Committing runtime PID files or exempting `.run/running/` from `.gitignore`.
- Changing production marker creation or watcher behavior.
- Reworking unrelated inbox fixtures or tests.

## Contract

### Requirement: Clean-checkout inbox fixture setup

The inbox integration fixture SHALL create the parent directory for its
runtime-injected live lock before writing the lock. The setup SHALL succeed
when the fixture is copied from tracked files in a clean checkout, where the
ignored `.run/running/` directory is absent.

#### Scenario: CI checks out only tracked fixture files
- **WHEN** the bare-CLI inbox integration suite injects a live lock into a freshly copied fixture
- **THEN** setup creates the missing runtime directory and the text and JSON integration cases reach their CLI assertions

## Human steps

- Approve the task title before the planner writes its task body.
- After reviewing the completed task body and delta, run `pnpm osq approve 038` yourself. Neither planner nor executor approves the change.

## Delta

- `specs/status-inspection/spec.md`: require the inbox integration fixture to create ignored runtime lock directories from clean tracked state.
