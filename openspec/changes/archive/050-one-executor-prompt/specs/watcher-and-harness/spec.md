# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Shared executor prompt
<!-- source: src/harness/prompt.ts, src/harness/agy/agy.ts, src/harness/opencode/opencode.ts, src/harness/codex/codex-prompt.ts, tests/harness-prompt-injection.test.ts, tests/fixtures/prompts/** -->
Every textual harness SHALL deliver the prompt `buildExecutorPrompt` returns,
byte for byte, and SHALL keep its own delivery, arguments, and attachments. The
prompt SHALL name the task file, `proposal.md`, title, scope, entry files,
verification command, result destination, prior context, delta spec paths, and
living spec paths, then the managed executor steps, capability rules, managed
exit text, and the concrete result path. It SHALL NOT name `features/` or a
parent `spec.md`.

#### Scenario: Same task, three harnesses
- **WHEN** agy, codex, and opencode build argv for the same fixture task
- **THEN** each carries the same prompt text, equal to its checked-in golden prompt

#### Scenario: Specs named for every harness
- **WHEN** a change writes a delta spec and its proposal reads a living capability that exists
- **THEN** every harness prompt lists the delta spec path under `Delta Specs:` and the living spec path under `Living Capability Specs:`

#### Scenario: Managed text reaches the prompt
- **WHEN** a harness prompt is built
- **THEN** it contains every managed executor step line and every managed exit line verbatim

## MODIFIED Requirements

### Requirement: Capability rule prompt injection
<!-- source: src/harness/prompt.ts, src/harness/types.ts, tests/harness-prompt-injection.test.ts -->
The harness runner SHALL extract rules from capability specifications written by the active change and inject them into the executor prompt.

#### Scenario: Prompt injection on change with capability writes
- **WHEN** an approved change writes capability deltas under `specs/<capability>/spec.md`
- **THEN** runner extracts capability requirements and injects them under a dedicated section within the prompt's `Rules:` block

#### Scenario: Fallback when no capability rules exist
- **WHEN** an approved change has no capability delta rules
- **THEN** runner provides standard operational rules without empty rule headers
