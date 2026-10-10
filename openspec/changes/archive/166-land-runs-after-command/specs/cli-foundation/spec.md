## ADDED Requirements

### Requirement: After-land command configuration
The `vcs` block MAY carry `afterLand`, a command osq runs in the checkout after
a land, as version-control "Land runs the after-land command" says. When set,
it SHALL be a non-empty string after trimming, kept trimmed, and validated as
`worktreeRoot`, `prepare` and `defaultBranch` are. A config without it SHALL
load exactly as before. osq's own `osq.config.ts` SHALL set it to `pnpm build`.

#### Scenario: Command kept trimmed
- **WHEN** `osq.config.ts` sets `vcs: { afterLand: '  pnpm build  ' }`
- **THEN** the loaded config carries `vcs.afterLand: 'pnpm build'`

#### Scenario: Blank command
- **WHEN** `osq.config.ts` sets `vcs: { afterLand: '   ' }`
- **THEN** loading fails with `vcs.afterLand must be a non-empty string if provided`

#### Scenario: osq builds itself after a land
- **WHEN** osq's own `osq.config.ts` is loaded
- **THEN** its `vcs.afterLand` is `pnpm build`

### Requirement: Plan prompt names the after-land command
When `vcs.afterLand` is set, the plan prompt's change header SHALL end with the
line `After land: osq runs <command> after every land, so it is not a human
step.` Without it the header SHALL be unchanged.

#### Scenario: Header with an after-land command
- **WHEN** `osq plan --next --print` runs in a project whose `vcs.afterLand` is `pnpm build`
- **THEN** the prompt's change header ends with `After land: osq runs pnpm build after every land, so it is not a human step.`

#### Scenario: Header without one
- **WHEN** the same command runs without `vcs.afterLand`
- **THEN** the prompt holds no `After land:` line

### Requirement: README describes the after-land command
README's version control configuration SHALL describe `vcs.afterLand`: osq
runs it in the checkout after every successful land, after the push on a
server, a failure leaves the land in place and shows in `osq status` and the
inbox until `osq land <id>` runs it again and it passes, and the watch service
and `osq server` pick up a new osq build by themselves.

#### Scenario: README names the key
- **WHEN** README is read with whitespace collapsed
- **THEN** it holds `vcs.afterLand` and `osq land <id>` in the same paragraph

## MODIFIED Requirements

### Requirement: Land checks the osq build
Before it loads configuration or runs `landChange`, `osq land <id>` SHALL run
`findStaleBuild` for osq's own package root. When that returns the stale line,
it SHALL print only that line to stderr, exit one, and touch no file or git
ref. `osq land <id> --allow-stale` SHALL skip the check. After a land that
exits zero, it SHALL print `osq's own source changed; run the build and
restart the watcher` to stdout, after the land's lines, when a path in the
land's changed paths lies under `<package root>/src/`, with the package root
and the repository root resolved through real paths, unless the land ran the
after-land command and it passed, as version-control "Land runs the after-land
command" says. Otherwise it SHALL print
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

#### Scenario: Land into osq itself with a passing after-land command
- **WHEN** `vcs.afterLand` is `node build.cjs`, the land commit adds `src/one.txt`, the package root is the repository root, and `node build.cjs` exits 0
- **THEN** stdout holds no `osq's own source changed` line, and its last line is `After-land command passed: node build.cjs`
