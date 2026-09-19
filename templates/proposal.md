---
title: Change title
depends_on: []
verify: node -e "process.exit(0)"
features:
  reads: []
---
## Goal

What problem this change solves and why.

## Contract

| Input | Expected Output |
|---|---|
| Sample input | Sample output |

## Non-goals

What this change deliberately does not do.

## Delta

Delta specs live beside the proposal at `specs/<capability>/spec.md`. Write one file per capability using `### Requirement:` blocks with `#### Scenario:` WHEN/THEN bullets, grouped under one of the OpenSpec operation headings:

```markdown
# Spec Delta: <capability>

## Purpose

Why this capability exists.

## ADDED Requirements

### Requirement: <requirement name>

The system SHALL <observable behavior>.

#### Scenario: <scenario name>
- **WHEN** <condition>
- **THEN** <outcome>

## MODIFIED Requirements

### Requirement: <requirement name>

The system SHALL <updated behavior>.

#### Scenario: <scenario name>
- **WHEN** <condition>
- **THEN** <outcome>

## REMOVED Requirements

### Requirement: <requirement name>

#### Scenario: <scenario name>
- **WHEN** <condition>
- **THEN** <outcome>

## RENAMED Requirements

- FROM: `<old requirement name>`
- TO: `<new requirement name>`
```

Every capability delta must also declare which repository files it owns. Add a `### Requirement: Code ownership` block whose `<!-- source: ... -->` comment lists the owned path globs, comma-separated. The ownership boundary scenario restates the same globs in its THEN bullet:

```markdown
### Requirement: Code ownership
<!-- source: src/core/example.ts, src/cli/example.ts -->
The <capability> capability SHALL own <subsystems>.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for <capability>
- **THEN** system maps `src/core/example.ts` and `src/cli/example.ts` to <capability>
```
