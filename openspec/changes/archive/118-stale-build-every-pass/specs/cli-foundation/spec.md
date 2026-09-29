## ADDED Requirements

### Requirement: Land checks the osq build
Before it loads configuration or runs `landChange`, `osq land <id>` SHALL run
`findStaleBuild` for osq's own package root. When that returns the stale line,
it SHALL print only that line to stderr, exit one, and touch no file or git
ref. `osq land <id> --allow-stale` SHALL skip the check. After a land that
exits zero, it SHALL print `osq's own source changed; run the build and
restart the watcher` to stdout, after the land's lines, when a path in the
land's changed paths lies under `<package root>/src/`, with the package root
and the repository root resolved through real paths. Otherwise it SHALL print
nothing new. `landCommand` SHALL take injectable `allowStale` and
`packageRoot`, the root defaulting to `osqPackageRoot()` from
`src/watcher/build.ts`.

#### Scenario: Stale land
- **WHEN** `osq land 001` runs with a package root whose `src/` is newer than its `dist/`
- **THEN** stderr is exactly the stale line and a newline, stdout is empty, the exit code is one, and the default branch has not moved

#### Scenario: Stale land allowed
- **WHEN** the same land runs with `allowStale`
- **THEN** it lands `001` and exits zero

#### Scenario: Land into osq itself
- **WHEN** the land commit adds `src/one.txt` and the package root is the repository root
- **THEN** the last stdout line is `osq's own source changed; run the build and restart the watcher`

#### Scenario: Linked package root
- **WHEN** the package root is a symbolic link to the repository root and the land commit adds `src/one.txt`
- **THEN** the last stdout line is `osq's own source changed; run the build and restart the watcher`

#### Scenario: Consumer project
- **WHEN** the package root is a separate directory with fresh `src/` and `dist/`, and the land commit adds `src/one.txt` in the project
- **THEN** stdout holds only the land's lines

#### Scenario: Allow stale flag
- **WHEN** `osq land --help` runs
- **THEN** it lists `--allow-stale`
