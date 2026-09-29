## MODIFIED Requirements

### Requirement: Capability rule prompt injection
The harness runner SHALL extract rules from capability specifications written
by the active change and inject them into the executor prompt. It SHALL leave
out a delta requirement whose statement, with HTML comments stripped and
whitespace collapsed, equals the statement of the living requirement with the
same name. Every requirement of a capability with no living spec SHALL keep
its rule.

#### Scenario: Prompt injection on change with capability writes
- **WHEN** an approved change writes capability deltas under `specs/<capability>/spec.md`
- **THEN** runner extracts capability requirements and injects them under a dedicated section within the prompt's `Rules:` block

#### Scenario: Fallback when no capability rules exist
- **WHEN** an approved change has no capability delta rules
- **THEN** runner provides standard operational rules without empty rule headers

#### Scenario: Unchanged requirement left out
- **WHEN** a delta modifies requirement `Totals` without changing its statement, and adds requirement `Refunds`
- **THEN** the executor prompt carries a rule for `Refunds` and none for `Totals`

## ADDED Requirements

### Requirement: Throwing spawn kills the task
When a harness adapter's `spawn` throws, the runner SHALL handle it as an
agent that exited with code -1 and the thrown message as its error: it writes
`.run/dead/<n>.md` with `reason: crashed`, emits a `dead` event, and returns a
failed task result. The throw SHALL NOT reach the watcher loop.

#### Scenario: Spawn E2BIG
- **WHEN** the adapter's `spawn` throws an error with message `spawn E2BIG`
- **THEN** `runTask` resolves as failed with reason `crashed`, and `.run/dead/<n>.md` holds `reason: crashed` and `spawn E2BIG`
