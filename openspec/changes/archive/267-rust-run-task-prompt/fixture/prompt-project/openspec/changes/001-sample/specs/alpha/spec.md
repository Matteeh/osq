## ADDED Requirements

### Requirement: New rule
<!-- source: crates/alpha/new/** -->
The alpha capability SHALL do
the new thing   across	lines.

#### Scenario: New
- **WHEN** alpha runs
- **THEN** it does the new thing

### Requirement: Bare rule
#### Scenario: Bare
- **WHEN** alpha runs
- **THEN** the bare rule holds

## MODIFIED Requirements

### Requirement: Shared rule
The alpha capability SHALL keep the shared rule.

#### Scenario: Shared
- **WHEN** alpha runs
- **THEN** the shared rule holds

### Requirement: Changed rule
The alpha capability SHALL do the new thing instead.

#### Scenario: Changed
- **WHEN** alpha runs
- **THEN** it does the old thing

## REMOVED Requirements

### Requirement: Old rule
**Reason**: New rule replaces it.
**Migration**: Use New rule.
