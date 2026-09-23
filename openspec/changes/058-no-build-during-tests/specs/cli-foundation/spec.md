# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Tests read the verified build
<!-- source: tests/package-install-smoke.test.ts, tests/bin-execution.test.ts, tests/package-hygiene.test.ts -->
No test under `tests/` SHALL run `npm run build`, `pnpm build`, `tsc`,
`vite build`, or `scripts/stage-ui.mjs`, or any other command that writes
`dist/` or `ui/dist/`. A test that needs the build SHALL read the output that
`pnpm verify` built before running tests. When that output is missing, it SHALL
fail with a message that names the missing path and says to run `pnpm build`
before verifying. `tests/package-hygiene.test.ts` SHALL enforce the rule by
scanning test sources.

#### Scenario: Missing build
- **WHEN** `dist/cli/bin.js` is missing and the bin or smoke test runs
- **THEN** it fails naming the path and `pnpm build`, without building

#### Scenario: A test adds a rebuild
- **WHEN** a test source spawns `npm` with `run build`
- **THEN** the package hygiene scan fails, naming the file and line
