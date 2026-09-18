# Spec Delta: Spec Lint and Approve

## Purpose

Validates change specifications against structural limits and OpenSpec standards, hashes approved changes deterministically, and seals approved specifications for autonomous execution.

## ADDED Requirements

### Requirement: Architecture Decision Record 004: Pinned OpenSpec Validator
<!-- source: decisions/004-pinned-openspec-validator.md, decisions/README.md -->
The project SHALL record and accept ADR 004 documenting the pinned `@fission-ai/openspec` dependency, exact version pin, validator execution semantics, and drift diagnostics.

#### Scenario: ADR 004 acceptance and indexing
- **WHEN** decisions in the repository are inspected
- **THEN** `decisions/004-pinned-openspec-validator.md` is present and indexed in `decisions/README.md` as accepted before approval

### Requirement: OpenSpec schema execution authority instructions
<!-- source: templates/openspec/schemas/osq/schema.yaml, templates/openspec/config.yaml, templates/openspec/schemas/osq/README.md -->
The OpenSpec schema template SHALL instruct agents that tasks are executed solely by `osq watch`, archiving is owned exclusively by `osq`, and task checkboxes are runner-written projections.

#### Scenario: Schema instructions enforce execution authority
- **WHEN** an agent reads schema instructions for tasks or apply actions
- **THEN** instructions explicitly prohibit direct task execution or `openspec archive`, delegating execution exclusively to `osq watch`