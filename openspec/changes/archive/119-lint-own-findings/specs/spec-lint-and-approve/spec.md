## MODIFIED Requirements

### Requirement: Repository lint output
After every change, `osq lint` SHALL print, at `info` level, `repository: <n>
findings about other changes and living specs; osq lint --repository lists
them`, counting unique repository findings, singular when `<n>` is 1. With
`--repository` it SHALL instead print each unique finding as `repository:
<severity> <file> (<requirement or section>): <message>`, under `repository:
findings about other changes and living specs; they do not affect the exit
code`. With none, it SHALL print neither.

#### Scenario: Two changes share a repository finding
- **WHEN** `osq lint --repository` lints two changes and OpenSpec reports one living spec warning
- **THEN** the warning prints once, under the repository group, after both changes

#### Scenario: Count in place of the list
- **WHEN** `osq lint 001` lints a valid change and OpenSpec reports warnings for two long requirements in living specs
- **THEN** the last line is `repository: 2 findings about other changes and living specs; osq lint --repository lists them`, no line starts `repository: warning `, and the exit code is 0

#### Scenario: One finding
- **WHEN** `osq lint 001` lints a valid change and OpenSpec reports one living spec warning
- **THEN** the last line is `repository: 1 finding about other changes and living specs; osq lint --repository lists them`

#### Scenario: No repository findings
- **WHEN** `osq lint 001` lints a change and there are no repository findings
- **THEN** no line starts `repository:`

#### Scenario: JSON keeps every finding
- **WHEN** `osq lint 001 --json` runs with two repository findings
- **THEN** the document's `repository` holds both findings, and stdout holds no text line
