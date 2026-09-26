## ADDED Requirements

### Requirement: osq's own decision records validate
<!-- source: decisions/**, tests/decisions-own.test.ts -->
Every ADR in osq's `decisions/` SHALL carry osq frontmatter. Reading the folder
and validating it against osq's living specs SHALL yield no ignored file, no
error, and no warning, and `checkProjectRules` SHALL report no error for osq's
AGENTS.md. `decisions/README.md` SHALL describe the frontmatter format. The
test of these records SHALL NOT pin ADR numbers, statuses, or which ADRs apply
to all.

#### Scenario: Own ADRs validate
- **WHEN** osq's own decisions folder is read and validated against its living specs
- **THEN** it yields at least one ADR, no ignored file, no error, and no warning, and the rules block check reports no error

#### Scenario: One more ADR
- **WHEN** a copy of osq's decisions folder and AGENTS.md gains a valid accepted ADR that applies to all, and `writeRulesBlock` refreshes the copy's rules block
- **THEN** the same checks report no error and no warning

## REMOVED Requirements

### Requirement: osq's own decision records
**Reason**: It pinned ADR numbers and said no ADR applies to all, so ADR 003 broke it.
**Migration**: See "osq's own decision records validate".
