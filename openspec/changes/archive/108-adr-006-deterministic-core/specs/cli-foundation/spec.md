## ADDED Requirements

### Requirement: osq's decisions index is complete
The index in osq's `decisions/README.md` SHALL link every ADR file in
`decisions/` exactly once, and no index link SHALL name a file that doesn't
exist. The test of the index SHALL NOT name an ADR number.

#### Scenario: Index lists every ADR
- **WHEN** the index in osq's `decisions/README.md` is read next to the ADR files in `decisions/`
- **THEN** every ADR file is linked exactly once, and every link names an ADR file that exists
