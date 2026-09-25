# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Archived verification requirement
<!-- source: src/watcher/archiver.ts, src/core/spec/human-steps.ts, tests/verification-record.test.ts -->
When an archived change's proposal has after-landing steps or a `check`
command, its `archived` event SHALL carry `verification: { afterLanding, check
}`, where `afterLanding` says whether after-landing steps exist and `check` is
the command or null. Otherwise the event SHALL carry no `verification` key. The
watcher SHALL archive exactly as before in both cases.

#### Scenario: After-landing steps
- **WHEN** a change whose `### After landing` lists a step is archived
- **THEN** its `archived` event carries `verification: { afterLanding: true, check: null }`

#### Scenario: No human steps
- **WHEN** a change whose `## Human steps` reads `None` and has no `check` is archived
- **THEN** its `archived` event carries only `archivePath`, as before

### Requirement: Human verification events
<!-- source: src/core/lifecycle/verification-record.ts, tests/verification-record.test.ts -->
The CLI SHALL append `check_ran` events, with data `command`, `exitCode`,
`duration`, `timedOut`, and `output`, and `verification_recorded` events, with
data `outcome` (`passed` or `failed`) and `note` (text or null), only to an
archived change's `.run/events/change.jsonl`. Their data types SHALL live in
`src/core/lifecycle/verification-record.ts`, as the `rejected` event's shape
lives in core.

#### Scenario: Recorded outcome
- **WHEN** a human records a failed outcome with a note
- **THEN** the archived change's stream gains one `verification_recorded` event with `outcome: "failed"` and the note
