# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Serve export flag
<!-- source: src/cli/serve.ts, src/cli/index.ts, README.md, tests/serve-export.test.ts -->
`osq serve --export <dir>` SHALL call the dashboard export for the current
project, print the written directory and a reminder that only the project root
and home directory paths were scrubbed, and exit 0 without binding a port or
opening a browser. A refused or failed export SHALL print its reason and exit
1. Without `--export`, `osq serve` SHALL behave as before.

#### Scenario: Export and exit
- **WHEN** a user runs `osq serve --export ./demo` in a project
- **THEN** the snapshot is written to `./demo`, the output names it and the scrub reminder, and no server starts

#### Scenario: Refused target
- **WHEN** `./demo` already contains files
- **THEN** the command prints the refusal and exits 1
