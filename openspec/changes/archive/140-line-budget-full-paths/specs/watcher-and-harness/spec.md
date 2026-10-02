## MODIFIED Requirements

### Requirement: Source module line budget enforcement
The test suite SHALL enforce a 250-line maximum on all source files under
`src/`, counted as the number of `\n`-separated lines. A file SHALL be exempt
only when its path relative to `src/` is on the allow list in
`tests/line-budget.test.ts`; a file of the same name elsewhere SHALL NOT be.
A listed path that no longer exists, or whose file is within the budget, SHALL
fail the test, so the list only shrinks.

#### Scenario: Source file size within budget
- **WHEN** files under `src/` are inspected
- **THEN** every file whose path relative to `src/` is not on the allow list contains 250 or fewer lines

#### Scenario: Same name in another folder
- **WHEN** `harness/types.ts` is listed and an unlisted `core/foo/types.ts` has more than 250 lines
- **THEN** the test fails naming `src/core/foo/types.ts` and its line count

#### Scenario: Listed file within the budget
- **WHEN** a listed path's file has 250 or fewer lines
- **THEN** the test fails naming that path and saying it should leave the allow list

#### Scenario: Listed file missing
- **WHEN** a listed path does not exist under `src/`
- **THEN** the test fails naming that path and saying it no longer exists
