# keep Specification

## Purpose
The keep capability of the link gates ownership fixture.

## Requirements

### Requirement: Code ownership
<!-- source: crates/keep/**, crates/split/** -->
The keep capability SHALL own the keep and split crates.

#### Scenario: Keep ownership
- **WHEN** file ownership is resolved for the keep and split crates
- **THEN** system maps `crates/keep/**` and `crates/split/**` to keep
