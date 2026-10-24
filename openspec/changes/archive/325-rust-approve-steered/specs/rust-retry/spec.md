## ADDED Requirements

### Requirement: Approval reaction
`RetryFeature`'s `reacts_to` SHALL give `EventKind::Approved` alone, and its
`react` SHALL clear the steering triggers of a change a human approved
again, as TypeScript's `retireSteering` in `src/core/spec/approve-steer.ts`
does through `retrySpec`, as the first reaction of ADR 030. For an
`approved` event delivered to a change folder, with `<tree>` the folder's
parent's parent's parent and `<id>` the folder name's leading digits,
`react` SHALL take each of the event's `targets`, in order, and:

- skip the target, writing nothing, when neither
  `.run/regressed/<target>.md` nor, for a task, `.run/dead/<target>.md`
  exists in the folder, or when the folder's `.run/events/<target>.jsonl`
  holds a `retry` event for the target whose timestamp is not before the
  `approved` event's, so an event delivered again changes nothing and never
  clears a failure that came after the retry it led to;
- otherwise retry the target as `retry <id> <target>` retries a target of an
  active change in `<tree>`, as "Retry refusals", "Retry record" and "Scope
  recertification" say, without "Plan edits refusal", since the approval
  just committed the plan.

A refusal or a write error SHALL fail the reaction with that `FeatureError`,
leaving the targets before it retired, so the next delivery skips them and
tries the rest. With every target handled, and for any other event, `react`
SHALL return an `Output` with empty text; an event of another kind writes
nothing.

#### Scenario: Retry reacts to approvals
- **WHEN** a test reads `RetryFeature`'s `reacts_to`
- **THEN** it is `[EventKind::Approved]`

#### Scenario: Approval reaction retires triggers
- **WHEN** `react` runs with a `Reaction` for an `approved` event with the row's `targets`, timestamped now, on a scratch project with git off whose change folder `001-a` holds `tasks/1.md` and `tasks/2.md`, `.run/approved` with the folder's seal, `.run/dead/1.md` with `reason: blocked` and `.run/regressed/change.md` with `reason: verify_red`
- **THEN** it gives an `Output` with empty text, and the folder's `.run/` holds the row's files in place of those two markers, each `retry` line in `<target>.jsonl` with the row's `attempt` and the marker's reason; running `react` again with the same event leaves every file under `.run/` as it was:

| Targets | Files |
|---|---|
| `1` | `dead/1.1.md`, `regressed/change.md`, `events/1.jsonl` with attempt 2 |
| `change`, `1` | `dead/1.1.md`, `regressed/change.1.md`, `events/change.jsonl` and `events/1.jsonl`, each with attempt 2 |
| `2` | `dead/1.md`, `regressed/change.md`, and no event file |
| none | `dead/1.md`, `regressed/change.md`, and no event file |

#### Scenario: Later failures are kept
- **WHEN** `react` runs for an `approved` event with the `targets` `1` on the folder of "Approval reaction retires triggers", then a new `.run/dead/1.md` with `reason: verify_red` is written, and `react` runs again with the same event
- **THEN** the second run gives an `Output` with empty text, and `.run/dead/1.md` and `events/1.jsonl` keep the bytes they had before it

#### Scenario: Approval reaction refusals
- **WHEN** `react` runs for an `approved` event with the row's `targets` on the folder of "Approval reaction retires triggers" after the row's setup
- **THEN** it gives the `Failed` error that `retry 001 <target>` gives for the row's first refused target on a copy of that folder, and the row's files are as it says:

| Setup | Targets | Files |
|---|---|---|
| `.run/running/2.pid` holding `{"pid":999999,"startedAt":0}` | `1`, `change` | `dead/1.1.md` and `events/1.jsonl` written, `regressed/change.md` kept and no `events/change.jsonl` |
| `tasks/1.md` gains a line after `.run/approved` was written | `1` | `dead/1.md` kept and no event file |

#### Scenario: Other events are passed over
- **WHEN** `react` runs for a `rejected` event on the folder of "Approval reaction retires triggers"
- **THEN** it gives an `Output` with empty text and every file under `.run/` keeps its bytes
