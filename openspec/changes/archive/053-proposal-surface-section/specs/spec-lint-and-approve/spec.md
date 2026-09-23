# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Proposal surface declaration
<!-- source: src/core/spec/linter.ts, tests/proposal-surface-lint.test.ts -->
`osq lint` and `osq approve` SHALL reject a `proposal.md` whose `## Surface`
section is missing or holds nothing but HTML comments and whitespace, with one
error that says to list the commands, flags, config keys, frontmatter fields,
document sections, dead reasons, and event types the change adds, changes, or
removes, or to write `None`. Any other text SHALL pass; lint SHALL NOT parse
or score the section. A legacy `spec.md` change document SHALL be exempt.

#### Scenario: Declared surface
- **WHEN** a proposal's `## Surface` section says `None` or lists added, changed, or removed names
- **THEN** lint reports no surface error

#### Scenario: Missing surface
- **WHEN** a proposal has no `## Surface` section
- **THEN** `osq lint` and `osq approve` fail with the surface error

#### Scenario: Comment-only surface
- **WHEN** a proposal's `## Surface` section holds only HTML comments
- **THEN** `osq lint` fails with the surface error
