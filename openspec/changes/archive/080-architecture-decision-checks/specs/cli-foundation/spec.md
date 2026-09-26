# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Decision checks and denied packages
<!-- source: src/core/foundation/decisions.ts, src/core/foundation/decisions-validate.ts, tests/adr-checks-denies.test.ts -->
ADR frontmatter MAY carry `checks`, a list of repository-relative test files
that enforce the decision, and `denies`, a list of package names the decision
forbids. Each ADR SHALL read both as lists, empty when the field is missing,
with each check path trimmed, using forward slashes, and without a leading
`./`. Validation SHALL report an error for a field that is not a list of
non-empty strings. Only accepted ADRs' checks and denied packages SHALL take
effect.

#### Scenario: Checks and denies read
- **WHEN** an accepted ADR has `checks: [./tests/adapter-imports.test.ts]` and `denies: [vue, "@vue/runtime-core"]`
- **THEN** it reads checks `tests/adapter-imports.test.ts` and denies `vue` and `@vue/runtime-core`

#### Scenario: Malformed denies
- **WHEN** an ADR has `denies: vue`
- **THEN** validation reports an error naming the ADR and `denies`

### Requirement: Decision check files in doctor
<!-- source: src/core/foundation/doctor-decisions.ts, tests/adr-checks-denies.test.ts -->
The `decisions` doctor check SHALL fail when a check file named by an accepted
ADR doesn't exist, naming the ADR and the file. A missing check file on a
proposed or superseded ADR SHALL NOT fail it.

#### Scenario: Missing check file
- **WHEN** accepted ADR 009 names `tests/adapter-imports.test.ts` and the file doesn't exist
- **THEN** doctor prints `[fail] decisions:` naming ADR 009's path and `tests/adapter-imports.test.ts`
