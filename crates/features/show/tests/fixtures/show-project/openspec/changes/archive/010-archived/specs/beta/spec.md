## ADDED Requirements

### Requirement: Beta caches
Beta SHALL cache the count.

#### Scenario: Beta caches
- **WHEN** beta reads twice
- **THEN** it reads alpha once

## MODIFIED Requirements

### Requirement: Beta reads
Beta SHALL read alpha's count through the alpha module.

#### Scenario: Beta reads
- **WHEN** beta runs
- **THEN** it reads the count
