---
title: No build during tests
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
---
## Goal

No test rewrites `dist/` while the suite runs.

`tests/package-install-smoke.test.ts` and `tests/bin-execution.test.ts` each
run `npm run build`, which rewrites `dist/` and `ui/dist/`. `node --test` runs
test files in parallel, so `tests/package-hygiene.test.ts` can run
`npm pack --dry-run` at the same moment and read a half-written file. That race
killed 053 task 3 with `change_verify_red`. npm reported `encountered unexpected
EOF` on `dist/cli/show.d.ts`, while every other test passed. Every UI task in
054 to 057 runs `pnpm verify` both as its own verify and as the change-level
verify, so each would get two chances to die the same way.

`pnpm verify` already builds before it runs any test, so the two rebuilds are
redundant. The tests read that build instead. If it's missing, they fail with
the same instruction `package-ui-budget.test.ts` already gives.

## Verify

`pnpm verify`

The suite checks that the smoke and bin tests use the existing build and fail
with a clear instruction when it's missing. It also checks that no test under
`tests/` runs `npm run build` or another build command. It needs no network
service beyond the smoke test's existing local install, no TTY, and no real
model.

## Non-goals

- Serializing the test runner or setting `--test-concurrency`.
- Changing what the package, bin, or smoke tests assert about the build.
- Changing `pnpm verify`, `pnpm test`, or any package script.

## Surface

None

## Contract

### Requirement: Tests read the verified build

No test SHALL run a command that writes `dist/` or `ui/dist/`. A test that needs
the build SHALL read the output `pnpm verify` built, and SHALL fail with an
instruction to run `pnpm build` when that output is missing.

#### Scenario: Parallel pack and bin tests
- **WHEN** the suite runs `package-hygiene`, `package-install-smoke`, and `bin-execution` in parallel
- **THEN** none of them writes `dist/`, so the pack never reads a partly written file

## Human steps

- Review the proposal, the delta, and the task, then run
  `pnpm osq approve 058` yourself.
- Approve 058 before the dashboard series; 054 depends on it.

## Delta

- `specs/cli-foundation/spec.md` adds `Tests read the verified build`.

One task owns all three test files.
