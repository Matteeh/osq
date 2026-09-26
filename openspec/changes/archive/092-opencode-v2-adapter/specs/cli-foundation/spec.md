## ADDED Requirements

### Requirement: OpenCode diagnostics
<!-- source: src/core/foundation/config-opencode.ts, src/core/foundation/harness-catalog.ts, tests/opencode-doctor.test.ts -->
The opencode catalog entry SHALL declare a `diagnose` hook adding a
`harness-version` check. It SHALL read the first `major.minor.patch` in the
`--version` output, so `opencode v2.0.18` reads as `2.0.18`. Inside
`>=2.0.0 <3.0.0` the check SHALL pass with `opencode <version> (tested >=2.0.0 <3.0.0)`.
Below 2.0.0 it SHALL fail with
`opencode <version> is not supported; the opencode adapter needs opencode 2 (tested >=2.0.0 <3.0.0)`.
At 3.0.0 or above, or when no version can be read, it SHALL pass with a
warning, `opencode <version> is outside the tested range >=2.0.0 <3.0.0`.

#### Scenario: Version 2
- **WHEN** `opencode --version` prints `opencode v2.0.18`
- **THEN** the `harness-version` check passes naming `2.0.18` and the tested range

#### Scenario: Version 1
- **WHEN** `opencode --version` prints `1.14.3`
- **THEN** the `harness-version` check fails naming `1.14.3`, and doctor exits 1

#### Scenario: Version 3
- **WHEN** `opencode --version` prints `opencode v3.0.0`
- **THEN** the `harness-version` check passes with a warning naming `3.0.0`
