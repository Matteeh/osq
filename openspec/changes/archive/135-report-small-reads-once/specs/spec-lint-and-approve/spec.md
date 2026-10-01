## ADDED Requirements

### Requirement: Parsed proposals are shared and frozen
Parsing a change folder's `proposal.md`, or its `spec.md` fallback, SHALL
return a frozen result whose lists are frozen too, so no caller can change it.
Inside one `osq report` run, every caller SHALL get the same parsed proposal
from one read. A proposal that cannot be read SHALL fail with the file-system
error, inside a report run and outside one.

#### Scenario: A caller changes a parsed proposal
- **WHEN** code assigns to a parsed proposal or pushes to one of its lists
- **THEN** the assignment throws

#### Scenario: Proposal is a directory
- **WHEN** a change folder's `proposal.md` is a directory and `osq status` runs
- **THEN** it exits 1 and prints one line starting `Status error: EISDIR`
