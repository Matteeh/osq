## ADDED Requirements

### Requirement: Own scenario tests
In osq's own repository, a traceability scenario test SHALL live in
`tests/trace-*.test.ts`, import `scenario` from `@matteeh/osq/testing`, and
cover the function that serves the scenario. When a THEN is an error a
synchronous function throws, it SHALL cover a test-local wrapper that
returns the message, because `run` counts a call that throws as never
settled. A scenario test SHALL NOT read the text of a file whose functions
carry its scenarios, because a mutation run executes it against a copy of
that file that Stryker has instrumented. A check that reads source text,
such as one that a tag is read, SHALL live in a `tests/trace-own-links-*`
file that does not import the helper. "Typed run" is proved by the type
probe in `tests/trace-helper.test.ts` under `pnpm typecheck:cli`.

#### Scenario: Tag read
- **WHEN** `scanSource` reads `src/core/trace/test-path.ts`
- **THEN** it records `isTestPath` serving `traceability: Test and source paths`

#### Scenario: Source checks outside scenario tests
- **WHEN** every `tests/trace-own-links-*.test.ts` file is read
- **THEN** none mentions `@matteeh/osq/testing`
