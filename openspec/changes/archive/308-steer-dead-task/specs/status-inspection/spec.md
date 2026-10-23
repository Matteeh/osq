## ADDED Requirements

### Requirement: Dead task steering
`humanSteering(state)` in `src/core/status/steering.ts` SHALL give the
triggers a human may steer an approved change by, reading only the derived
`SpecState`. When `state.steering` is not empty it SHALL return that list
unchanged. Otherwise it SHALL return one
`{ target: <task number>, trigger: "dead", reason: <deadReason or ""> }` for
each task whose status is `dead`, in task order, and an empty list when
there is none. `describeTrigger` SHALL render such a trigger as
`task <n> dead (<reason>)`.

`deriveSteering` SHALL never return a `dead` trigger, so `deriveSpecState`,
the watcher, the inbox, land and auto-steer see no change. Only `osq plan
<id>` and `osq approve <id>` read `humanSteering`, for a change in an osq
worktree.

#### Scenario: Dead task without a trigger
- **WHEN** an approved change's task 1 is done and task 2 has an active dead marker with `reason: timeout` and no `stuck`
- **THEN** `deriveSteering` returns no trigger, and `humanSteering` returns `[{ target: "2", trigger: "dead", reason: "timeout" }]`, which `describeTrigger` renders as `task 2 dead (timeout)`

#### Scenario: Run triggers win
- **WHEN** an approved change's task 1 has an active dead marker with `reason: blocked` and task 2 one with `reason: timeout`
- **THEN** `humanSteering` returns only the `blocked` trigger for task 1, the same list as `deriveSteering`

#### Scenario: Nothing died
- **WHEN** an approved change has a done task and a pending task and no marker
- **THEN** `humanSteering` returns an empty list
