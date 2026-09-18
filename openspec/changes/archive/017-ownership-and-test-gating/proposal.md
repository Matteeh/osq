---
title: Code ownership, prompt rule injection, and test modification gating
depends_on: ['016']
features:
  reads: [cli-foundation, metrics-and-reporting, spec-lint-and-approve, status-inspection, watcher-and-harness]
---
## Goal

Establish deterministic code ownership across capabilities, inject capability-specific rules into executor prompts, and enforce test modification gating during task execution.

1. **Code Ownership per Capability**: Every living capability specification (openspec/specs/<capability>/spec.md) declares an explicit ### Requirement: Code ownership listing file path globs owned by that capability. Ownership is parsed dynamically by matching the requirement header name (### Requirement: Code ownership). This maps repository source and test files deterministically to capability boundaries.
2. **Rule Injection into Executor Prompts**: When an agent executes a task for a change that writes to capability specifications, the runner inspects the target capability specs and extracts capability-specific rules, injecting them directly into the executor prompt alongside standard operational guidelines. Agents are thus given authoritative context and constraints relevant to the subsystems they are altering.
3. **Test Modification Gating**: Tasks that need to alter existing test suites must explicitly declare permission via frontmatter (	ests.modify: true). If a task execution touches or modifies existing test files without declaring 	ests.modify, the runner detects the violation and terminates the task with a dead marker and authoritative event recording 
eason: undeclared_test_change.

## Contract

| Trigger / Action | Expected Behavior |
|---|---|
| Capability spec parsing | Parser locates ### Requirement: Code ownership by header name and extracts declared file path globs for each capability |
| Change folder linting (osq lint) | Verifies 	ests.modify frontmatter type if declared; validates that modified files belong to declared capability boundaries |
| Task execution prompt construction | Runner extracts rules from capability specs that the change writes and injects them into the executor prompt for gy and opencode |
| Agent modifies existing tests with 	ests.modify: true | Pre-verification test modification check succeeds; execution proceeds to verify command |
| Agent modifies existing tests without 	ests.modify | Pre-verification check detects undeclared test modification, halts task, writes .run/dead/<n>.md with 
eason: undeclared_test_change, and emits dead event |
| Agent creates new test file without 	ests.modify | New test file creation is permitted without 	ests.modify; task proceeds normally |
| Status, Show, & Report inspection | osq status, osq show, and osq report format and categorize undeclared_test_change across terminal and JSON output |

## Non-goals

- Restricting the addition of new test files (only modification or deletion of preexisting test files requires 	ests.modify).
- Modifying the approval hash sealing algorithm or .run/ directory structure.
- Calling external OpenSpec writing commands or altering independent zero-trust verification.

## Human steps

Upon approval and watcher execution of 017:

1. **Prerequisite Confirmation**:
   Verify that 016 cut-over migration (osq migrate openspec) was executed so living capabilities exist under openspec/specs/.
2. **Spec Authoring Practice**:
   When authoring tasks that intentionally refactor or update preexisting test suites, ensure the task frontmatter declares:
   `yaml
   tests:
     modify: true
   `
   Tasks that only add new tests or edit implementation files do not require this declaration.

## Delta

This change introduces code ownership definitions across all capabilities, prompt rule injection from written delta specs, and test modification gating via this change's own delta specifications in specs/<capability>/spec.md.
