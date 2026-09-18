# CLI Foundation

Describes the foundational command-line interface, configuration system, and project scaffolding in `osq`.

## Configuration

`osq` loads its operational configuration from `osq.config.ts` located at the root of the project. Configuration is typed by `OsqConfig` and declared using the `defineConfig` helper:

- Limits:
  - `maxScopeFiles`: Maximum number of files matched by a task's scope glob (default: 8).
  - `maxFeatureWrites`: Maximum entries in `features.writes` (default: 2).
  - `maxContractTables`: Maximum markdown tables allowed under `## Contract` (default: 1).
  - `maxAcceptanceLines`: Maximum lines permitted in task acceptance checklist (default: 7).
- Paths:
  - `specs`: Root folder for change specifications (default: `specs`).
  - `archive`: Folder for completed change specifications (default: `specs/archive`).
  - `features`: Living documentation describing current behavior of main (default: `features`).
  - `decisions`: Architectural decision records (default: `decisions`).
- Timeouts:
  - `staleLockSeconds`: Maximum age for task locks before reaping (default: 300).
  - `taskTimeoutSeconds`: Maximum duration allowed for a single agent execution (default: 1800).
- Harness:
  - Adapter used for spawning coding agents (default: `agy` or `OSQ_HARNESS` environment variable).

## Scaffolding (`osq init`)

Running `osq init` sets up the folder structure and initial templates in any project:
- Creates `specs/`, `specs/_template/`, `specs/archive/`, `features/`, and `decisions/`.
- Places default `osq.config.ts` and `.env.example` if they do not already exist.
- Places `spec.md`, `tasks.md`, and `tasks/1.md` templates under `specs/_template/`.
- Injects or refreshes the managed agent procedure block in `AGENTS.md` between `<!-- OSQ:START -->` and `<!-- OSQ:END -->`. Existing content outside the markers is preserved.
- `init` is strictly idempotent and safe to run on existing repositories.

## Change Creation (`osq new <name>`)

Running `osq new <name>` prepares a new change specification:
- Scans `specs/` to find the highest numbered prefix and generates the next 3-digit padded number (e.g. `001` -> `002`).
- Kebab-cases the name into a clean directory slug.
- Recursively copies `specs/_template/` into `specs/<id>-<slug>/`.
- Updates `spec.md` with the supplied human-readable title.

## Leveled Logging & Terminal Output

The `osq` CLI utilizes a unified leveled stderr logger (`createLogger`) supporting `quiet`, `normal`, and `verbose` levels, augmented with interactive status line management:

- **Interactive Status Sink**: The logger exposes `status(text)` and `clearStatus()` methods. When a status text is active on an interactive TTY, incoming log lines clear the status row (`\r\x1b[2K`), write the formatted log line above, and redraw the status row below, ensuring continuous status visibility without interleaving or garbling log records.
- **Terminal Capabilities & Environment Detection**: Animation and terminal control sequences are automatically enabled only when stderr is an interactive TTY, `--quiet` is not specified, and `process.env.CI` is unset. When animation is inactive, status operations are safe no-ops. Color and unicode symbols automatically downgrade to plain text when `NO_COLOR` is present or TTY is absent.

## Distribution & Release Management

`osq` is distributed as a public, standalone npm package installable globally via `npm i -g osq` or runnable on-demand via `npx osq`:

- **Package Artifact Hygiene**: The published tarball contains exclusively compiled output (`dist/`), starter templates (`templates/`), and essential legal and usage documentation (`README.md`, `LICENSE`, `package.json`). Package manifests declare `keywords`, `packageManager`, and `sideEffects: false`, while build scripts run standard compiler invocations (`npm run build`) decoupled from specific package manager binaries on `PATH`.
- **Runtime Executable & API Types**: The primary binary entrypoint (`dist/cli/bin.js`) preserves executable shebangs across compilation steps and resolves version identifiers dynamically from `package.json` at runtime, ensuring parity with release metadata. Programmatic TypeScript consumers receive full declaration typings through `dist/index.d.ts`.
- **Automated OIDC Release Pipeline**: Production releases are triggered by pushing semver git tags matching `v*` to the repository. The release workflow (`.github/workflows/release.yml`) executes frozen-lockfile validation, verification test suites, and fresh consumer installation smoke tests before publishing with `npm publish --provenance --access public`. Authentication is negotiated strictly through npm Trusted Publishing using OpenID Connect (OIDC) tokens, eliminating persistent credential secrets.
- **Version Tracking & Release Procedure**: Every published release corresponds to a documented entry in `CHANGELOG.md`. Release engineers update package version metadata, append release notes, commit changes, tag the commit with the matching `v<version>`, and push tags to main to initiate automated distribution.
