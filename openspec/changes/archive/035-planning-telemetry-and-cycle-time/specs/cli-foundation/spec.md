# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Append-only planning session lifecycle
<!-- source: src/cli/plan.ts, src/core/planning.ts, tests/plan-telemetry.test.ts -->
Every non-print `osq plan` invocation SHALL append one `plan_started` and one
`plan_exited` record to `<change>/.run/plan.jsonl`, including invocations that
open an existing change. Both records SHALL carry a generated planning-session
identifier so pairs remain unambiguous in an append-only log.

`plan_started` SHALL be written before the interactive process is spawned and
contain the selected harness and model, selected agent when one exists, the osq
package version, and a SHA-256 hash of the exact `brief.md` bytes. `plan_exited`
SHALL contain the process exit code, non-negative wall seconds, and nullable
input, output, cached, and reasoning token counts plus nullable cost.

#### Scenario: New and resumed planning sessions
- **WHEN** interactive planning starts for a new or existing change and the process later exits
- **THEN** the change's append-only planning log contains one correlated lifecycle pair with exact identity, timing, outcome, and observed usage fields

#### Scenario: Failed planning process
- **WHEN** the interactive process cannot spawn or exits unsuccessfully
- **THEN** `plan_exited` records the non-zero outcome and elapsed wall time before existing failure propagation continues

#### Scenario: Print mode
- **WHEN** `osq plan -print` builds and emits an opening prompt without launching a process
- **THEN** no planning lifecycle record is appended
