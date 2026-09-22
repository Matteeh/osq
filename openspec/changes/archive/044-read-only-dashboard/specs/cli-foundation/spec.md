# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Read-only dashboard command and configuration
<!-- source: src/cli/serve.ts, src/cli/index.ts, src/core/config*.ts, src/index.ts, tests/serve-cli.test.ts, tests/config-serve.test.ts -->
The CLI SHALL provide `osq serve [--port <n>] [--open]`. It SHALL bind a Node
`http` server only to `127.0.0.1`, print the actual listening URL, optionally
launch that URL in the platform default browser after listening, and close its
HTTP and filesystem-watch resources on SIGINT or SIGTERM. It SHALL never start
the execution watcher or write a project, cursor, change, or marker file.

Public configuration SHALL contain
`serve: { port: number, eventDebounceMs: number }`, defaulting to port `4173`
and a 100 millisecond debounce interval. Both values SHALL be validated, with
the debounce required to be finite and non-negative. `--port` SHALL take precedence
over configuration and accept only integer ports from 0 through 65535; zero
SHALL request an operating-system-assigned port. Browser launch SHALL use
platform facilities without a new runtime dependency. Startup failure,
including `EADDRINUSE`, SHALL report an actionable error and exit nonzero
without launching a browser or retaining a watcher.

#### Scenario: Configured loopback server
- **WHEN** a user runs `osq serve` without a CLI port
- **THEN** the server listens on `127.0.0.1` at `serve.port` and prints its exact URL after listening

#### Scenario: CLI port precedence
- **WHEN** `--port 0` or another valid port is supplied
- **THEN** it overrides configuration and the command reports the actual bound loopback port

#### Scenario: Invalid or unavailable port
- **WHEN** a port is outside the valid integer range or cannot be bound
- **THEN** the command exits nonzero without opening a browser or leaving server resources running

#### Scenario: Open in default browser
- **WHEN** `--open` is supplied and the server begins listening
- **THEN** the command launches the printed loopback URL once through the current platform's default-browser command

## MODIFIED Requirements

### Requirement: Package hygiene and release distribution
<!-- source: package.json, pnpm-workspace.yaml, scripts/stage-ui.mjs, src/core/web-static.ts, tests/package-hygiene.test.ts, tests/package-install-smoke.test.ts, tests/ui-budget.test.ts -->
The system SHALL package exclusively compiled CLI artifacts, staged dashboard
assets, templates, and legal metadata for npm distribution. The private React
and Vite workspace SHALL build production files into package-root `ui/dist`
through the root build used by `prepublishOnly`, and root `package.json` SHALL
list that directory in `files`.

React, React DOM, their type declarations, and Vite SHALL remain build-time
dependencies of the private UI workspace. The published CLI's runtime
dependency set SHALL gain no frontend or server package. All regular files
below staged `ui/dist` SHALL total no more than 1,000,000 bytes, enforced by
`pnpm verify` after a production UI build.

The repository and published package SHALL use Node 24 as their supported
major-version floor. Package engines, CI setup, consumer guidance, and the UI
workspace SHALL agree on that baseline; CI SHALL resolve the maintained Node 24
LTS line rather than a Current release. At planning time the verified current
LTS patch is 24.21.0.

#### Scenario: Runtime executable version resolution
- **WHEN** `osq --version` is executed from the compiled binary
- **THEN** system dynamically reads version from `package.json` matching release metadata

#### Scenario: Packed dashboard assets
- **WHEN** the root package is built and packed
- **THEN** the tarball contains `ui/dist/index.html` and production assets but excludes UI source, tests, and workspace build dependencies

#### Scenario: Installed dashboard server
- **WHEN** the tarball is installed into an isolated consumer project
- **THEN** `osq serve` can return the packaged index without React or Vite appearing in the installed package's runtime dependencies

#### Scenario: Dashboard exceeds its budget
- **WHEN** staged UI regular files total more than one million bytes
- **THEN** the ordinary verification gate fails and reports the measured total

#### Scenario: Node toolchain alignment
- **WHEN** package metadata, CI, documentation, and workspace manifests are inspected
- **THEN** each names the Node 24 LTS baseline without retaining a Node 22-only setup
