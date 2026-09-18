---
title: Fix packed tarball smoke test and decouple test suite from pnpm
depends_on: ['018']
features:
  reads:
    - cli-foundation
  writes:
    - cli-foundation
---
## Goal

Resolve the recurring CI test failure in the packed tarball smoke test caused by pnpm offline metadata errors, eliminate hard dependencies on `pnpm` being on `PATH` across the test suite, and ensure that test setup failures report meaningful test failures instead of cancelling sibling subtests.

1. **Consumer Tarball Smoke Test Contract**: Ensure the package under test comes from the freshly packed local tarball while its dependencies resolve normally from wherever the package manager retrieves them. Drop `npm_config_offline` and `npm_config_registry=http://127.0.0.1:1/`, keep `npm_config_audit=false`, `npm_config_fund=false`, and `NO_COLOR=1`, and install with `--prefer-offline` so the store is used when populated and the network only fills gaps. Document this explicit guarantee in the file's header comment.
2. **Package Manager Independence in Tests**: Eliminate all hardcoded `pnpm` spawn invocations across the test suite. Replace `pnpm build` with `npm run build` and consumer package installations with `npm`, enabling `npm test` to pass cleanly on a machine without `pnpm` on `PATH`. Enforce this property via a grep-based test asserting that no string `pnpm` is passed as a spawn command anywhere under `tests/`.
3. **Robust Smoke Test Execution & Reporting**: Move setup logic that shells out (packing and installing the tarball) out of the `before` hook and into the first `it` block. The first test performs setup and stores paths in suite-scoped variables; the subsequent `it` blocks assert against the state it produced and fail with a clear message if it did not run. Any remaining hook that spawns a process wraps the invocation so errors name the command, its arguments, and the working directory, eliminating `cancelledByParent` cascades.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Smoke test environment (`tests/package-install-smoke.test.ts`) | Drops `npm_config_offline` and `npm_config_registry`; retains `npm_config_audit=false`, `npm_config_fund=false`, `NO_COLOR=1`; installs packed tarball using `--prefer-offline` |
| Smoke test header comment | Explicitly states: "the package under test comes from the freshly packed local tarball, its dependencies come from wherever pnpm normally gets them" |
| Test suite package manager spawns | No test under `tests/` spawns `pnpm` by name; `pnpm build` replaced with `npm run build`; automated grep test asserts no string `pnpm` is passed as a spawn command |
| Smoke test setup error handling | Tarball pack and install occur in the first `it`; failures report a distinct failed test naming the command, arguments, and `cwd`, with zero `cancelledByParent` subtests |

## Non-goals

- Altering production runtime code under `src/`.
- Adding new external dependencies.
- Modifying npm Trusted Publishing or release mechanics in `.github/workflows/release.yml`.

## Human steps

None. This change alters only test suite execution and CI workflow configuration.

## Delta

The release-procedure documentation does not mention offline installation; therefore, no specification delta is applied to living documents.
