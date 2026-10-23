# alpha Specification

## Purpose
Alpha counts and sleeps.

## Requirements

### Requirement: Alpha starts
Alpha SHALL start at zero.

#### Scenario: Alpha starts
- **WHEN** alpha starts
- **THEN** its count is zero

### Requirement: Alpha sleeps
Alpha SHALL sleep between calls.

#### Scenario: Alpha sleeps
- **WHEN** alpha is idle
- **THEN** it sleeps
