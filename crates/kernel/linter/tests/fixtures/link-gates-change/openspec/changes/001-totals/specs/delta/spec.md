## ADDED Requirements

### Requirement: Reads totals
The system SHALL read a total.

#### Scenario: Read after add
- **WHEN** a total is read after an add
- **THEN** it is the sum

## MODIFIED Requirements

### Requirement: Adds numbers
The system SHALL add two numbers, zero included.

#### Scenario: Two plus two
- **WHEN** two and two are added
- **THEN** the sum is four

#### Scenario: Zero plus two
- **WHEN** zero and two are added
- **THEN** the sum is two

## RENAMED Requirements

- FROM: `### Requirement: Resets totals`
- TO: `### Requirement: Clears totals`
