# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Executor protocol constants and result headings
<!-- source: src/core/foundation/init-blocks.ts, AGENTS.md, .opencode/agent/osq-coder.md, tests/managed-blocks.test.ts -->
The step lines of the managed `## Executing a task` section and the body lines
of `## Exiting` SHALL be exported constants in
`src/core/foundation/init-blocks.ts`, and `MANAGED_AGENTS_MD_BODY` SHALL be
assembled from them. `## Exiting` SHALL name the result headings `## Changed`,
`## Deviated`, `## Missing context`, and `## Next` in that order, tell the
executor to leave out empty ones, and require a final `Touched:` line listing
every changed file other than the result file.

#### Scenario: Result headings defined once
- **WHEN** `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** it contains every exported executor step line and every exported exit line verbatim, and the exit lines name `## Changed`, `## Deviated`, `## Missing context`, `## Next`, and `Touched:`

#### Scenario: Repository copies stay current
- **WHEN** the managed block in the repository's `AGENTS.md` or `.opencode/agent/osq-coder.md` is inspected
- **THEN** it equals `MANAGED_AGENTS_MD_BODY`

### Requirement: Harness agent file diagnostics
<!-- source: src/core/foundation/doctor-managed.ts, src/core/foundation/doctor.ts, tests/doctor-agent-file.test.ts -->
When the configured execution harness or planner harness is `opencode`, the
doctor `managed-blocks` check SHALL also inspect
`.opencode/agent/<opencode.agent>.md`, the executor agent file `osq setup`
writes, against the managed `AGENTS.md` block. A missing file, or a missing,
partial, reversed, duplicated, or stale block, SHALL fail the check with a
message that names the file and names `osq setup` as the fix. Other harnesses
SHALL NOT require the file.

#### Scenario: Stale opencode agent file
- **WHEN** the harness is `opencode` and the agent file's managed block differs from the managed `AGENTS.md` block
- **THEN** the `managed-blocks` check fails with a message naming the agent file and `run osq setup`

#### Scenario: Current opencode agent file
- **WHEN** the harness is `opencode` and the agent file holds the current managed block
- **THEN** the agent file does not fail the `managed-blocks` check

#### Scenario: Other harness
- **WHEN** neither the execution harness nor the planner harness is `opencode` and no agent file exists
- **THEN** the agent file does not affect the `managed-blocks` check
