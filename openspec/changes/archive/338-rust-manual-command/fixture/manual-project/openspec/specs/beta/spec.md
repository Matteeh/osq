# beta Specification

## Purpose

The app's shared library and its config.

## Requirements

### Requirement: Code ownership
<!-- source: src/lib/**, osq.toml -->
The beta capability SHALL own the shared library and the config.

#### Scenario: Beta ownership
- **WHEN** file ownership is resolved for beta
- **THEN** system maps `src/lib/**` and `osq.toml` to beta
