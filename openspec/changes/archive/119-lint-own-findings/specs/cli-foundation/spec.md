## ADDED Requirements

### Requirement: Lint repository flag
`osq lint [ids...]` SHALL accept `--repository`, described as `list every
repository finding`, and pass it to `lintCommand` as `repository: true`.
Without it, `lintCommand` SHALL print the repository count line that
"Repository lint output" describes.

#### Scenario: Flag listed
- **WHEN** `osq lint --help` runs
- **THEN** it lists `--repository`

#### Scenario: Flag reaches the command
- **WHEN** `osq lint 001 --repository` runs through `createProgram` next to a living spec with one long requirement
- **THEN** it prints the repository header line and one line starting `repository: warning `
