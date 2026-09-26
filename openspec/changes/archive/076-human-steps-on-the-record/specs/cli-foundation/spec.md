# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Check command
<!-- source: src/cli/check.ts, src/core/lifecycle/verification-record.ts, src/cli/index.ts, tests/verification-record.test.ts -->
`osq check <id>` SHALL run an archived change's recorded `check` command from
the project root with `runVerificationCommand` and the verify timeout, append
one `check_ran` event, print the exit code, output, and next step, and exit 0
only when the check passed. It SHALL refuse, writing nothing, a change that is
not archived or has no check command.

#### Scenario: Check runs on request
- **WHEN** `osq check 012` runs on an archived change with `check: node check.cjs`
- **THEN** `node check.cjs` runs once and one `check_ran` event records its exit code and output

#### Scenario: No check command
- **WHEN** `osq check 012` runs on an archived change without a check command
- **THEN** it exits 1 with an error and appends nothing

### Requirement: Verified command
<!-- source: src/cli/verified.ts, src/core/lifecycle/verification-record.ts, src/cli/index.ts, tests/verification-record.test.ts -->
`osq verified <id> --passed|--failed [--note <text>]` SHALL require exactly one
of `--passed` and `--failed`, find an archived change that requires
verification, append one `verification_recorded` event with its `outcome` and
`note`, and print the change's next step. It SHALL refuse, writing nothing, any
other change, and SHALL change nothing else in the archive.

#### Scenario: Passed outcome
- **WHEN** a human runs `osq verified 012 --passed` on a pending change
- **THEN** one `verification_recorded` event is appended and it prints `Next: landed`

#### Scenario: Both flags
- **WHEN** a human runs `osq verified 012 --passed --failed`
- **THEN** it exits 1 with an error and appends nothing

### Requirement: Plan handoff next step
<!-- source: src/cli/plan-queue.ts, tests/plan-approve-next-step.test.ts -->
The one line the `osq plan` prompt handoff prints SHALL end with
` — next: <next step>` for the change it hands off.

#### Scenario: Fresh handoff
- **WHEN** `osq plan <name>` hands off a new change 021
- **THEN** its one line ends with ` — next: unplanned — osq plan 021`

### Requirement: Approve refusal next step
<!-- source: src/cli/approve.ts, tests/plan-approve-next-step.test.ts -->
When `osq approve <id>` fails for a change whose folder exists, it SHALL print
`Next: <next step>` for that change after the error.

#### Scenario: Approving a template
- **WHEN** `osq approve 021` runs on a change that still has the placeholder verify
- **THEN** it fails and prints `Next: unplanned — osq plan 021`

### Requirement: Planner human steps guidance
<!-- source: src/core/foundation/init-blocks.ts, templates/openspec/schemas/osq/schema.yaml, tests/human-steps-guidance.test.ts -->
The planner block and osq schema SHALL tell planners to split `## Human steps`
into `### Before approval` and `### After landing`, with steps during the run
under Before approval, and that after-landing steps or a `check` command keep
the change pending, and dependents waiting, until `osq verified`.

#### Scenario: Planner block names the subsections
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it names `### Before approval`, `### After landing`, `check: <command>`, and `osq verified`
