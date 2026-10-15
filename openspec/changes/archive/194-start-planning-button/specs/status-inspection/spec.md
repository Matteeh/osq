## ADDED Requirements

### Requirement: Planning next step
For an active change whose derived state has a planner that
`readLivePlanner(state)` returns, `readNextStep` SHALL return state
`planning`, command `osq show <id>`, and detail `since <time>`, with `<time>`
from `formatPauseUntil` of the planner's `since`. This rule SHALL come before
every other rule for an active change in "Change next step", approved or not.
`planning` SHALL be one of the `NextStepState` values, and `formatNextStep`
renders it as it renders every state. `osq show <id>` and `osq status` SHALL
print it on their next step lines.

#### Scenario: Planning format
- **WHEN** unapproved change 007 has a brief and the sentinel verify, and its `.run/plan-run.md` holds a `running` record with `at` `2026-10-14T09:30:00.000Z` and the test's own pid
- **THEN** `formatNextStep` renders `planning (since 2026-10-14 09:30 UTC) — osq show 007`, `osq show 007` prints `Next: planning (since 2026-10-14 09:30 UTC) — osq show 007`, and `osq status` prints `  next: planning (since 2026-10-14 09:30 UTC) — osq show 007` under the change

#### Scenario: Steering while planning
- **WHEN** approved change 007 has task 2 dead with `reason: blocked` and a current `.run/auto-steer.md` `running` record with the test's own pid
- **THEN** its next step is `planning` with command `osq show 007`

#### Scenario: Planner that stopped
- **WHEN** change 007's `running` record names a pid whose process has exited
- **THEN** its next step is `unplanned` with command `osq plan 007`, as without the record

### Requirement: Planner start eligibility
`canStartPlanner(next, location, config)` in
`src/core/status/plan-run-eligible.ts` SHALL be true only when `location` is
`active`, `vcs.enabled` is true, and `next.state` is `unplanned` or
`ready-for-approval`, or is `dead` with detail `needs steering`. It SHALL read
nothing else.

#### Scenario: Who may start a planner
- **WHEN** `canStartPlanner` reads each next step and location below with `vcs.enabled` on, unless the row says otherwise
- **THEN** it returns:

| Next step | Location | Result |
|---|---|---|
| `unplanned` | `active` | true |
| `ready-for-approval` | `active` | true |
| `dead`, detail `needs steering` | `active` | true |
| `dead`, detail `revised plan ready` | `active` | false |
| `dead`, detail null | `active` | false |
| `planning` | `active` | false |
| `running` | `active` | false |
| `dead`, detail `needs steering` | `archived` | false |
| `unplanned`, `vcs.enabled` off | `active` | false |
