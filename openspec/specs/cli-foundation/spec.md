# cli-foundation Specification

## Purpose

Provides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, and npm package distribution.

## Requirements

### Requirement: Configuration loading and schema validation
<!-- source: src/core/config.ts, src/core/config-gates.ts, tests/config.test.ts, tests/pre-spawn-config.test.ts, tests/auto-retry-config.test.ts -->
The system SHALL load operational configuration from `osq.config.ts` merged
over `DEFAULT_CONFIG` using the `defineConfig` helper. Public configuration
SHALL contain `gates.changeVerifyAfterTask`, a boolean defaulting to `true`,
`gates.preSpawnVerify`, one of `warn`, `fail`, or `off`, defaulting to `warn`,
and `gates.autoRetries`, a non-negative integer defaulting to 1. Partial gate
configuration SHALL merge over those defaults and invalid gate values SHALL be
rejected.

#### Scenario: Default configuration resolution
- **WHEN** no `osq.config.ts` exists in the project root
- **THEN** system defaults harness to `agy`, maxConcurrency to 1, maxScopeFiles to 8, timeouts to standard limits, `gates.changeVerifyAfterTask` to true, `gates.preSpawnVerify` to `warn`, and `gates.autoRetries` to 1

#### Scenario: Environment variable overrides
- **WHEN** `OSQ_HARNESS` or `OSQ_MODEL` is set in the process environment or `.env`
- **THEN** system overrides the corresponding configuration values

#### Scenario: Incremental verification opt-out
- **WHEN** configuration declares `gates.changeVerifyAfterTask: false`
- **THEN** resolved configuration retains false while preserving all unrelated gate defaults

#### Scenario: Invalid incremental verification toggle
- **WHEN** `gates.changeVerifyAfterTask` is present with a non-boolean value
- **THEN** configuration validation fails with a diagnostic naming the key

#### Scenario: Pre-spawn verify mode
- **WHEN** configuration declares `gates.preSpawnVerify: fail` or `off`
- **THEN** resolved configuration retains that mode while preserving `gates.changeVerifyAfterTask`

#### Scenario: Invalid pre-spawn verify mode
- **WHEN** `gates.preSpawnVerify` is present with a value other than `warn`, `fail`, or `off`
- **THEN** configuration validation fails with a diagnostic naming the key

#### Scenario: Automatic retry count
- **WHEN** configuration declares `gates.autoRetries: 0`
- **THEN** resolved configuration retains 0 while preserving the other gate defaults

#### Scenario: Invalid automatic retry count
- **WHEN** `gates.autoRetries` is negative, fractional, or not a number
- **THEN** configuration validation fails with a diagnostic naming the key

### Requirement: Scaffolding and project initialization
<!-- source: features/cli-foundation.md # Scaffolding (osq init), tests/init.test.ts -->
The system SHALL initialize repository structure and agent instructions via `osq init` idempotently.

#### Scenario: First initialization in clean directory
- **WHEN** user executes `osq init`
- **THEN** system creates `openspec/`, `specs/`, config files, templates, and injects managed block into `AGENTS.md`

#### Scenario: Re-running initialization on existing repository
- **WHEN** user executes `osq init` on an existing project
- **THEN** system preserves existing files outside managed markers and reports existing paths as skipped

### Requirement: Change specification creation
<!-- source: features/cli-foundation.md # Change Creation (osq new <name>), tests/new.test.ts -->
The system SHALL prepare new change specifications via `osq new <name>`.

#### Scenario: Numbering and slugification
- **WHEN** user executes `osq new <name>`
- **THEN** system calculates the next 3-digit padded identifier from active and archived changes, creates a slugified directory, copies templates, and writes the title

### Requirement: Interactive terminal status line and log leveling
<!-- source: features/cli-foundation.md # Leveled Logging & Terminal Output, tests/logger.test.ts, tests/logger-status.test.ts -->
The logger SHALL render a single-line live animated status row on interactive TTY terminals without corrupting permanent logs.

#### Scenario: Interactive TTY rendering
- **WHEN** stderr is an interactive TTY, quiet mode is unset, and CI is unset
- **THEN** status row animates an 80ms spinner, truncates text to terminal width minus spinner prefix, and never applies `[osq]` prefix to status text

#### Scenario: Non-TTY and CI fallback
- **WHEN** stderr is not a TTY or `CI` environment variable is set
- **THEN** logger disables dynamic status animation and status calls become no-ops

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

### Requirement: Code ownership
<!-- source: src/core/foundation/**, src/cli/**, src/index.ts, osq.config.ts, templates/**, AGENTS.md, PLANNER.md, README.md, .env.example -->
The CLI Foundation capability SHALL own CLI entrypoints, retry and rejection
commands, configuration and shared harness capability resolution, doctor
diagnostics, logger, initialization, public configuration exports, managed
agent and planner instructions, templates, and consumer guidance.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for CLI, configuration, retry, scaffolding, or managed guidance files
- **THEN** system maps `src/core/foundation/**`, `src/cli/**`, `src/index.ts`, `osq.config.ts`, `templates/**`, `AGENTS.md`, `PLANNER.md`, `README.md`, and `.env.example` to cli-foundation

### Requirement: Test gating configuration
<!-- source: src/core/config.ts, tests/config.test.ts -->
The configuration loader SHALL define test file patterns used for test modification gating.

#### Scenario: Default test pattern resolution
- **WHEN** no custom test patterns are declared in `osq.config.ts`
- **THEN** system defaults test gating matchers to `tests/**`

### Requirement: Watch stale build and dev mode CLI options
<!-- source: src/cli/index.ts, src/cli/watch.ts -->
The CLI watch command SHALL support options to bypass stale build detection and enable reactive dev execution.

#### Scenario: Stale build bypass flag
- **WHEN** user executes `osq watch --allow-stale`
- **THEN** CLI passes `allowStale: true` to the watch loop options

#### Scenario: Reactive dev mode flag
- **WHEN** user executes `osq watch --dev`
- **THEN** CLI passes `dev: true` to the watch loop options

### Requirement: Repository health diagnostics
<!-- source: src/cli/doctor.ts, src/core/foundation/doctor.ts, src/core/foundation/config*.ts, tests/doctor.test.ts, tests/openspec-version.test.ts -->
The CLI SHALL provide a doctor command that validates configuration, harness binary availability, managed blocks, lock states, archive integrity, and the OpenSpec validator. A check MAY pass with a warning; doctor prints it as `[warn]` and it does not change the exit code.

#### Scenario: Doctor passes on healthy repository
- **WHEN** user executes `osq doctor` in a properly configured repository with the pinned validator
- **THEN** command prints one status line per check (`config`, `harness`, `managed-blocks`, `locks`, `archives`, `validator`) and exits with code 0

#### Scenario: Doctor fails on check violation
- **WHEN** any diagnostic check fails (invalid config, missing harness binary, drift in managed blocks, orphaned locks, invalid archives, or a validator outside the peer range)
- **THEN** command reports the failed check line and exits with code 1

#### Scenario: Doctor fails on validator drift
- **WHEN** the installed OpenSpec validator version lies outside the `peerDependencies` range declared in osq's `package.json`
- **THEN** command reports a failing `validator` line describing version drift and exits with code 1

#### Scenario: Doctor warns on a compatible validator
- **WHEN** the installed OpenSpec validator version differs from the pinned version but lies inside the declared peer range
- **THEN** command prints a `[warn] validator:` line naming the version and the range, and exits with code 0

#### Scenario: Doctor rejects an incomplete gate configuration
- **WHEN** the resolved configuration lacks a boolean `gates.changeVerifyAfterTask`
- **THEN** the doctor config check fails as invalid or incomplete

### Requirement: Planner instruction scaffolding
<!-- source: src/core/init.ts, tests/init-planner.test.ts -->
The project scaffolding SHALL initialize and maintain a managed instructions block in `PLANNER.md`.

#### Scenario: Scaffolding creates or updates PLANNER.md
- **WHEN** user executes `osq init` in a repository
- **THEN** system ensures `PLANNER.md` exists and contains the current managed osq planner protocol between `<!-- OSQ:START -->` and `<!-- OSQ:END -->`

### Requirement: Canonical OpenSpec path layout
<!-- source: src/core/layout.ts, src/core/config.ts, tests/layout.test.ts -->
The engine SHALL derive all change folder and run artifact locations through a canonical layout module anchored to `openspecRoot`, removing redundant spec and archive path configurations.

#### Scenario: Layout derivation from OpenSpec root
- **WHEN** change folders or `.run` artifact paths are resolved
- **THEN** paths derive deterministically from `openspecRoot` without referencing independent specs or archive path overrides

#### Scenario: Configuration schema excludes legacy paths
- **WHEN** configuration is validated or loaded
- **THEN** `paths.specs` and `paths.archive` are absent from `OsqPaths` and rejected by linting

### Requirement: Complete layout consumer cut-over
<!-- source: src/core/layout.ts, src/core/status.ts, src/core/show.ts, src/core/report.ts, src/cli/lint.ts -->
All CLI entrypoints and core workflow commands SHALL derive change and archive directory paths strictly through `src/core/layout.ts` without reading `config.paths.specs` or `config.paths.archive`.

#### Scenario: Status inspection resolves via layout
- **WHEN** user executes `osq status`
- **THEN** command resolves change folders from `getChangesDir(config.paths.openspecRoot, cwd)` and archive count from `getArchiveDir(config.paths.openspecRoot, cwd)`

#### Scenario: Show and report commands resolve via layout
- **WHEN** user executes `osq show` or `osq report`
- **THEN** commands locate spec folders and completed archives using canonical layout helpers

### Requirement: Managed block coexistence
<!-- source: src/core/init.ts, src/cli/setup.ts, tests/setup-block-coexistence.test.ts -->
The setup command and managed block updater SHALL preserve foreign OpenSpec managed blocks in `AGENTS.md` without corruption across repeated executions.

#### Scenario: Repeated setup preserves both managed blocks
- **WHEN** `osq setup` executes against an `AGENTS.md` containing `<!-- OPENSPEC:START -->`
- **THEN** both `<!-- OPENSPEC:START -->` and `<!-- OSQ:START -->` blocks survive unchanged across multiple runs

### Requirement: Canonical migration layout authority
<!-- source: src/core/migrate.ts, tests/migrate.test.ts -->
The migration engine SHALL resolve target directory paths exclusively through `src/core/layout.ts`.

#### Scenario: Migration derives targets from layout module
- **WHEN** `osq migrate openspec` resolves target specs, changes, or archive folders
- **THEN** paths derive exclusively from `getSpecsDir`, `getChangesDir`, and `getArchiveDir`

### Requirement: OpenSpec layout initialization and template retirement
<!-- source: src/core/init.ts, tests/init.test.ts -->
The project initialization command SHALL scaffold only `openspec/` directories and configuration files, and SHALL NOT create legacy `specs/` directories or `specs/_template/`.

#### Scenario: Scaffolding creates OpenSpec layout only
- **WHEN** user executes `osq init` in a clean directory
- **THEN** system creates `openspec/` directory structure and configuration, leaving `specs/` uncreated

#### Scenario: Legacy specs template absent
- **WHEN** repository scaffolding is inspected
- **THEN** `specs/_template/` does not exist

### Requirement: OpenSpec agent documentation and managed instructions block
<!-- source: src/core/foundation/init-blocks.ts, README.md, AGENTS.md, tests/managed-blocks.test.ts, tests/init.test.ts -->
The project documentation and managed `AGENTS.md` block SHALL describe the OpenSpec layout and execution protocol, SHALL NOT reference retired paths (`features/`, `specs/`, or `drift against features`), and SHALL preserve foreign OpenSpec blocks during setup.
The managed block SHALL be written for the executor. Its `## Executing a task`
section SHALL state the read order, the too-big exit, reading a prior result,
tests before code, the write boundary with the task's `scope` authoritative over
any injected ownership rule, that a preexisting test may change only with
`tests.modify: true` and the file inside `scope`, and that the executor runs the
task's `verify` and then the proposal's `verify` before exiting. The block
SHALL name the approval gate and the verification gate and SHALL carry no
planner rules beyond its `## Planning a change` section.

#### Scenario: Managed block contains no retired paths
- **WHEN** `AGENTS.md` or `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** neither contains references to `features/`, `specs/`, or `drift against features`

#### Scenario: Foreign OpenSpec block preserved during setup
- **WHEN** `osq setup` executes against an `AGENTS.md` containing an OpenSpec managed block
- **THEN** both `<!-- OPENSPEC:START -->` and `<!-- OSQ:START -->` blocks survive unchanged

#### Scenario: Executor protocol names the gates that kill a task
- **WHEN** `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** it contains `## Executing a task`, `tests.modify: true`, the instruction to run the proposal's `verify` after the task's, and the statement that the task's `scope` wins over any other ownership rule

### Requirement: Manual task completion command
<!-- source: src/cli/done.ts, src/core/done.ts, src/cli/index.ts, tests/done-manual.test.ts -->
The CLI SHALL provide `osq done <id> <n> --manual "<reason>"` allowing a human to mark a task done with required justification, writing a frontmatter-annotated marker and event.

#### Scenario: Executing osq done with reason
- **WHEN** user runs `osq done <id> <n> --manual "<reason>"`
- **THEN** system writes `.run/done/<n>` with frontmatter declaring `manual: true` and `reason`, and appends `done_manual` event

#### Scenario: Missing manual flag fails command
- **WHEN** user runs `osq done <id> <n>` without `--manual`
- **THEN** command exits non-zero and refuses to mark the task done

### Requirement: Hand-placed done marker detection in doctor
<!-- source: src/core/doctor.ts, tests/doctor.test.ts -->
The `osq doctor` command SHALL inspect all `.run/done/` markers across active change folders and fail if any marker lacks valid frontmatter.

#### Scenario: Hand-placed done marker reported as failure
- **WHEN** a done marker in an active change folder lacks valid automated (`scope_hash`) or manual (`manual: true`) frontmatter
- **THEN** `osq doctor` reports a failure identifying the invalid hand-placed marker

#### Scenario: Legitimate done markers pass
- **WHEN** all done markers possess valid automated or manual frontmatter
- **THEN** doctor done-markers check reports ok

### Requirement: Planner file tool protocol instruction
<!-- source: src/core/init.ts, PLANNER.md, tests/init-planner.test.ts -->
The managed planner instructions block in `PLANNER.md` and `src/core/init.ts` SHALL instruct planners to write files using the file tool rather than shell echo.

#### Scenario: Managed block includes file tool instruction
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** the text contains `Write files with the file tool, never through a shell echo.`

### Requirement: Planner protocol rules in documentation and templates
<!-- source: PLANNER.md, templates/PLANNER.md, src/core/foundation/init-blocks.ts, tests/init-planner.test.ts -->
The managed planner block in `PLANNER.md`, `templates/PLANNER.md`, and
`src/core/foundation/init-blocks.ts` SHALL encode slicing, detail, file tool,
change-level verify, final-tree verification, and task file-ownership rules.
Every task verify SHALL exercise its complete slice through a real entrypoint
and remain safely re-runnable against the final tree of the completed change.
A file SHALL belong to one task unless a later task must extend it; that later
task SHALL be ordered after the first owner and the proposal SHALL identify the
shared file.
The block SHALL state interactive planning and the `osq plan` handoff as
separate modes sharing the write-boundary, lint, and no-approval rules. It SHALL
state that the watcher runs the change-level `verify` after every task, so tasks
that pass only together are one task; that a later task changing an earlier done
task's resolved `scope` halts the change until a human runs `osq retry`, and
globs resolve again at every audit; that a preexisting test changes only with
`tests.modify: true` and the file in `scope`; and that `osq lint` enforces the
configured limits on scope patterns and acceptance lines.

#### Scenario: Managed block encodes planner discipline
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it requires complete real-entrypoint and final-tree verifies, forbids out-of-scope executor excuses, mandates acceptance lines and reuse names without signatures or numbered steps, requires single-task file ownership with ordered documented extensions, requires file tool usage, and places change-level verify immediately after the goal

#### Scenario: Managed block encodes between-task watcher rules
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** its task rules state the change-level verify after every task, the scope-overlap halt resolved by `osq retry`, glob re-resolution, and the `tests.modify` rule

#### Scenario: Byte-equality test for planner templates
- **WHEN** `tests/init-planner.test.ts` executes
- **THEN** it asserts byte-for-byte equality between the `PLANNER.md` managed block, `templates/PLANNER.md`, and `MANAGED_PLANNER_BLOCK` in `src/core/foundation/init-blocks.ts`

### Requirement: Planner configuration validation
<!-- source: src/core/config.ts, tests/config-planner.test.ts -->
The configuration subsystem SHALL support and validate an optional `planner` block defining `harness`, `model`, and optional `agent`.

#### Scenario: Rejection of invalid planner configuration
- **WHEN** `planner` is configured with an empty string or unrecognized harness
- **THEN** `defineConfig` throws a descriptive validation error

### Requirement: Opencode planner agent configuration
<!-- source: src/harness/opencode/opencode.ts, tests/opencode-planner-setup.test.ts -->
The setup command for the opencode harness SHALL generate `.opencode/agent/osq-planner.md` with restricted planning tool permissions.
The file SHALL use only OpenCode permission keys. Its `bash` permission SHALL be
an ordered pattern map that denies `*`, then allows `osq lint*`,
`pnpm osq lint*`, and `npx osq lint*`, then denies any command containing a
shell operator, so that under OpenCode's last-match-wins rule the planner can
run `osq lint` and no other shell command. Setup SHALL NOT overwrite an existing
planner agent file.

#### Scenario: Planner agent permissions and idempotence
- **WHEN** `osq setup` executes with `opencode` harness configured
- **THEN** system generates `.opencode/agent/osq-planner.md` permitting `read`, `edit`, `glob`, `grep`, denying `webfetch` and `websearch`, giving `bash` the lint-only pattern map, and repeated runs remain byte-identical

#### Scenario: Chained lint command
- **WHEN** the planner's `bash` rules are evaluated against `osq lint 048 && rm -rf x`
- **THEN** the last matching rule denies it

### Requirement: Interactive planning command
<!-- source: src/cli/plan.ts, src/cli/plan-queue.ts, src/cli/index.ts, src/core/report.ts, tests/plan-handoff.test.ts -->
The CLI SHALL provide `osq plan <name> [--brief <file> | -] [--session | --print]`
and `osq plan --next [--session | --print]` to prepare an ordinary or
queue-selected change. Every mode SHALL build the same five ordered prompt
sections: complete `PLANNER.md`, change identity, capability spec paths,
complete brief, and `This repository's record` derived from the 20 most recent
archived changes under the established bounded rules.

Without `--session` or `--print`, planning SHALL create `plan-prompt.md` from
those exact prompt bytes, record `planner: null` in brief frontmatter, avoid
constructing or spawning a harness adapter, and print one line containing the
folder path and `ask your planning tool to plan change <slug>`. Queue item
selection, dependency projection, hashes, replanning, and halt rules SHALL stay
unchanged.

`--session` SHALL preserve the existing planner selection, brief attribution,
interactive process, and owned telemetry behavior. `--print` SHALL emit the
same prompt exclusively to stdout without writing `plan-prompt.md`, launching a
process, or recording telemetry.

#### Scenario: New change interactive planning session
- **WHEN** a user executes `osq plan <name> --session` with a usable brief
- **THEN** the system creates the change and brief, builds the five ordered prompt sections, and spawns the selected interactive planner

#### Scenario: Resuming existing change planning session
- **WHEN** a user executes `osq plan <id> --session` on an existing change with `brief.md`
- **THEN** the system reuses the folder and launches a fresh interactive session with the same five-section prompt contract

#### Scenario: Small repository record
- **WHEN** fewer than five measured tasks exist in the recent archive window
- **THEN** every planning mode keeps the established record-too-small fifth section and contains no partial repository record

#### Scenario: Ordinary prompt handoff
- **WHEN** a user executes `osq plan <name> --brief <file>` in the default mode
- **THEN** the change contains a null-attributed brief and complete prompt file, stdout gives the one-line handoff, and no harness or planning record is created

#### Scenario: Queue prompt handoff
- **WHEN** a user executes `osq plan --next` with an eligible item
- **THEN** exactly that item becomes planned through the existing queue semantics and receives the same prompt-file handoff

#### Scenario: Explicit osq-owned session
- **WHEN** either planning form includes `--session`
- **THEN** the configured interactive planner, model-attributed brief, and lifecycle telemetry behave as before

#### Scenario: Print mode outputs prompt to stdout
- **WHEN** either planning form includes `--print`
- **THEN** the complete five-section prompt is written exclusively to stdout without a prompt file, interactive process, or telemetry

### Requirement: Codex configuration and resolution
<!-- source: src/core/config*.ts, src/index.ts, tests/codex/** -->
The configuration subsystem SHALL support harness codex and publicly exported CodexConfig with optional non-empty bin, model, and effort strings, preserving existing harness defaults. Codex binary resolution SHALL use explicit codex.bin, then CODEX_PATH, then codex. Executor model resolution SHALL use explicit codex.model, then OSQ_MODEL only for a Codex executor, then native Codex defaults. Effort SHALL use explicit codex.effort or native defaults.

#### Scenario: Explicit configuration wins
- **WHEN** explicit Codex settings and environment fallbacks both exist
- **THEN** osq uses explicit settings without borrowing another harness's model

#### Scenario: Native defaults
- **WHEN** Codex model and effort have no applicable configuration
- **THEN** osq omits their CLI overrides and does not invent a resolved model

### Requirement: Codex setup and diagnostics
<!-- source: src/cli/setup.ts, src/core/doctor.ts, src/core/config*.ts, src/harness/codex*.ts, tests/codex/** -->
The system SHALL support Codex setup through the shared managed AGENTS procedure without generating harness-specific configuration or credentials. Doctor SHALL probe the configured Codex execution binary with --version, resolving it identically to the adapter. Optional harnessPreflightSeconds and harnessKillGracePeriodMs timeout fields SHALL preserve existing timeout-object compatibility and use centrally configured defaults.

#### Scenario: Idempotent mixed-harness setup
- **WHEN** Codex is the executor, planner, or both and setup runs repeatedly
- **THEN** shared instructions and foreign managed blocks coexist, consumer Codex files remain intact, no Codex files are created, and the other selected adapter is also set up where applicable

#### Scenario: Failed binary probe
- **WHEN** the resolved Codex executable is missing, returns nonzero, or exceeds its configured preflight deadline
- **THEN** doctor reports an actionable failing harness check and exits unsuccessfully

### Requirement: Codex planning selection
<!-- source: src/core/config*.ts, src/cli/plan.ts, tests/codex/** -->
Planner configuration SHALL accept codex with the existing required non-empty planner.model and SHALL reject planner.agent for Codex. The planning command SHALL use the selected planner harness's model consistently in brief metadata and process arguments, including when falling back to a Codex executor. Explicit Codex planners SHALL use native effort defaults rather than executor-specific effort.

#### Scenario: Independent planner model
- **WHEN** executor and planner use different harnesses and the planner is Codex
- **THEN** the brief and invocation use planner.model and do not inherit the executor's model, OSQ_MODEL fallback, or effort

#### Scenario: Implicit Codex planner
- **WHEN** no planner block exists and the execution harness is Codex
- **THEN** planning uses the Codex executor's selected model, or writes default in brief metadata and omits the CLI model flag when native selection is used

#### Scenario: Unsupported planner agent
- **WHEN** planner.harness is codex and planner.agent is supplied
- **THEN** configuration fails with a clear unsupported-setting error rather than silently ignoring the agent

#### Scenario: Existing-change and print paths
- **WHEN** planning reopens an existing change with a brief or uses the existing print option
- **THEN** the existing change is reused for a fresh file-seeded session, while print mode emits the ordered opening prompt without launching Codex

### Requirement: Codex consumer guidance
<!-- source: README.md, .env.example, src/core/init.ts, tests/codex-guidance.test.ts -->
The README and scaffolded environment example SHALL describe Codex selection, independent planning configuration, optional model/effort, precedence, setup and authentication prerequisites, permissions, diagnostics, fresh sessions, watcher verification, and observed-only metrics. Examples SHALL preserve the current default harness and contain no credentials or hard-coded recommended model.

#### Scenario: Scaffold preservation
- **WHEN** a clean project is scaffolded and later scaffolded again after its environment example is edited
- **THEN** the original generated example includes commented Codex guidance and the repeat run preserves consumer edits

#### Scenario: Honest support boundaries
- **WHEN** a consumer reads the Codex guidance
- **THEN** it distinguishes task scope from sandbox permissions, leaves unreported cost unestimated, and describes optional live validation without claiming an untested minimum CLI version

### Requirement: Canonical harness capability catalog
<!-- source: src/core/harness-catalog.ts, src/core/config*.ts, src/harness/index.ts, src/index.ts, tests/harness-catalog.test.ts -->
The configuration subsystem SHALL maintain one immutable catalog of supported harness names and shared capabilities for executable resolution, execution identity, effort attribution, and planner-agent support. Supported-name validation, available-name diagnostics, and shared harness resolution SHALL derive from this catalog without independent harness-name sets. Adapter factories SHALL be statically exhaustive over the catalog-derived harness name type.

#### Scenario: Consistent registered harness lookup
- **WHEN** a registered executor or planner harness is resolved with supported casing
- **THEN** configuration validation, adapter lookup, available names, and shared metadata identify the same catalog entry

#### Scenario: Catalog and adapter factory parity
- **WHEN** a catalog entry lacks an adapter factory or a factory lacks a catalog entry
- **THEN** type checking or registry contract tests fail

### Requirement: Capability-driven planner validation
<!-- source: src/core/harness-catalog.ts, src/core/config*.ts, src/cli/plan.ts, tests/config-planner-catalog.test.ts, tests/plan-handoff.test.ts -->
Planner configuration SHALL remain optional and SHALL be resolved, validated,
and required only for an explicit `--session` planning path. Session selection
SHALL use explicit planner configuration when present and otherwise the
selected executor's catalog entry without borrowing another harness's model,
effort, or agent. Default prompt handoff and print mode SHALL not resolve a
planner or use configuration to attribute a brief or manifest.

Generated configuration and consumer guidance SHALL say that model choice for
planning belongs to the tool in which the author plans unless osq is explicitly
asked to launch the session.

#### Scenario: Supported planner configuration
- **WHEN** `--session` uses planner settings supported by the selected catalog entry
- **THEN** validation returns normalized configuration and the session uses that harness's model and agent selection

#### Scenario: Unsupported planner setting
- **WHEN** `--session` supplies an optional setting unsupported by its selected harness
- **THEN** validation fails with an error naming the harness and unsupported setting

#### Scenario: Implicit planner selection
- **WHEN** `--session` is requested without a planner block
- **THEN** planning uses the selected executor's planner capabilities without borrowing settings from another harness

#### Scenario: Default handoff has no planner configuration
- **WHEN** an author prepares or prints a prompt without a planner block
- **THEN** planning succeeds without model selection and the default brief attribution is null

#### Scenario: Session uses planner configuration
- **WHEN** an author requests `--session`
- **THEN** supported planner settings are validated and selected through the canonical harness catalog before launch

### Requirement: Catalog-driven harness diagnostics
<!-- source: src/core/doctor.ts, src/core/harness-catalog.ts, tests/harness-generic-workflows.test.ts -->
Repository health diagnostics SHALL resolve the selected executor's external executable through the canonical harness catalog and probe it with the configured deadline. A catalogued harness that declares no external executable SHALL pass the harness diagnostic without spawning a process.

#### Scenario: External harness diagnostic
- **WHEN** doctor checks a registered harness with an external executable
- **THEN** it probes the catalog-resolved command and reports its version or an actionable missing, nonzero, or timeout failure

#### Scenario: No-binary harness diagnostic
- **WHEN** doctor checks a registered harness declaring no external executable
- **THEN** the harness check succeeds without a process probe

### Requirement: Generic harness consumer guardrails
<!-- source: tests/harness-architecture.test.ts -->
Generic configuration, diagnostics, planning, manifest, and watcher consumers SHALL NOT select behavior through comparisons or fallback expressions naming individual first-party harnesses. Architecture validation SHALL derive forbidden generic-consumer name branches from the canonical catalog rather than a separately maintained harness list.

#### Scenario: Harness-specific generic branch
- **WHEN** a generic consumer introduces a semantic branch or cross-harness fallback naming a catalogued harness
- **THEN** architecture validation fails

#### Scenario: Future first-party harness
- **WHEN** a future first-party harness is added
- **THEN** generic consumers require no harness-specific branch changes

### Requirement: Append-only planning session lifecycle
<!-- source: src/cli/plan.ts, src/core/planning.ts, tests/plan-telemetry.test.ts -->
Every non-print `osq plan` invocation SHALL append one `plan_started` and one
`plan_exited` record to `<change>/.run/plan.jsonl`, including invocations that
open an existing change. Both records SHALL carry a generated planning-session
identifier so pairs remain unambiguous in an append-only log.

`plan_started` SHALL be written before the interactive process is spawned and
contain the selected harness and model, selected agent when one exists, the osq
package version, and a SHA-256 hash of the exact `brief.md` bytes. `plan_exited`
SHALL contain the process exit code, non-negative wall seconds, and nullable
input, output, cached, and reasoning token counts plus nullable cost.

#### Scenario: New and resumed planning sessions
- **WHEN** interactive planning starts for a new or existing change and the process later exits
- **THEN** the change's append-only planning log contains one correlated lifecycle pair with exact identity, timing, outcome, and observed usage fields

#### Scenario: Failed planning process
- **WHEN** the interactive process cannot spawn or exits unsuccessfully
- **THEN** `plan_exited` records the non-zero outcome and elapsed wall time before existing failure propagation continues

#### Scenario: Print mode
- **WHEN** `osq plan -print` builds and emits an opening prompt without launching a process
- **THEN** no planning lifecycle record is appended

### Requirement: Explicit retry command
<!-- source: src/cli/retry.ts, src/core/retry.ts, src/cli/index.ts, tests/retry*.test.ts -->
The CLI SHALL provide `osq retry <id> <target>` for an active change, where the
target is a numeric task or literal `change`. Retry SHALL require matching
approval, an active dead or regressed marker, and no running marker for the
target. It SHALL refuse invalid states without mutation and direct missing or
stale approval to `osq approve <id>` without approving for the caller.

A numeric task carrying `reason: scope_regression` and an automated done marker
SHALL be recertified by running its verify command without spawning an agent.
A pass SHALL refresh canonical done and report recertification without advancing
execution attempts. A failure SHALL requeue the task and report that agent work
is pending. Dead tasks, other regression reasons, and change-level regressions
SHALL retain their established retry behavior. No new retry flag SHALL exist.

#### Scenario: Retrying a failed task
- **WHEN** a user retries an approved dead or non-scope-regressed numeric task that is not running
- **THEN** the CLI performs the existing preserving retry transition and reports its next execution attempt

#### Scenario: Recertifying a scope-regressed task
- **WHEN** a user retries an approved numeric task with an active scope regression and automated done marker
- **THEN** the CLI reports either successful human recertification or requeue after running verification under the configured timeout

#### Scenario: Retrying another task regression
- **WHEN** a user retries an approved numeric task with a non-scope regression
- **THEN** the CLI performs the existing preserving retry transition without recertification verification

#### Scenario: Retrying a change-level regression
- **WHEN** a user runs `osq retry <id> change` for an approved change with `.run/regressed/change.md` and nothing running
- **THEN** the CLI clears the active regression through the preserving retry transition

#### Scenario: Approval remediation
- **WHEN** the approval marker is missing or its hash differs from the authored change folder
- **THEN** retry exits non-zero without mutation and names `osq approve <id>` as the next step

### Requirement: Explicit rejection command
<!-- source: src/cli/reject.ts, src/core/reject.ts, src/cli/index.ts, tests/reject.test.ts -->
The CLI SHALL provide `osq reject <id> --reason <text>` for moving an eligible
active change intact to
`openspec/changes/rejected/<original-folder-name>/`. A non-empty reason is
required. An unapproved change is eligible; an approved change is eligible only
with an active dead or regressed target and no running task. The command SHALL
refuse healthy approved, complete, running, archived, already rejected, missing,
or destination-colliding changes.

#### Scenario: Rejecting an unapproved change
- **WHEN** a user rejects an unapproved active change with a non-empty reason
- **THEN** its complete folder moves to the canonical rejected directory

#### Scenario: Rejecting an approved failed change
- **WHEN** a user rejects an approved change with an active dead or regressed target and nothing running
- **THEN** its complete folder moves without applying deltas or changing task checkboxes

#### Scenario: Rejecting an ineligible change
- **WHEN** a user targets a healthy approved, complete, running, archived, already rejected, missing, or colliding change
- **THEN** rejection exits non-zero and does not move or overwrite a folder

### Requirement: Bare command inbox entrypoint
<!-- source: src/cli/index.ts, src/cli/inbox.ts, tests/inbox.test.ts, tests/cli.test.ts -->
The root CLI SHALL execute the human attention inbox when invoked without a
subcommand instead of printing Commander help. The root SHALL accept `--json`
to select the inbox JSON representation. Help, version, named subcommands, and
subcommand-local options including `report --json` SHALL retain their existing
dispatch and behavior.

#### Scenario: Bare text invocation
- **WHEN** a user executes `osq` with no subcommand or root options
- **THEN** the root action prints the text inbox and does not print Commander help

#### Scenario: Bare JSON invocation
- **WHEN** a user executes `osq --json`
- **THEN** the root action prints only the stable inbox JSON object

#### Scenario: Explicit command invocation
- **WHEN** a user executes `osq status`, `osq report --json`, help, version, or another registered subcommand
- **THEN** Commander dispatches the existing command without running or advancing the inbox

### Requirement: Brief queue command and configuration
<!-- source: src/cli/queue.ts, src/cli/index.ts, src/core/config.ts, src/index.ts, tests/queue.test.ts, tests/config-queue.test.ts -->
The CLI SHALL provide `osq queue`, reading the queue only from
`openspec/queue.md` and printing every item in file order with its derived
state, associated change, rejection count, unmet dependencies, and section
drift. The command SHALL NOT write the queue file.

Public configuration SHALL accept an optional `queue` block containing both
`maxPlanningSessions` and `maxPlanningCost` as finite non-negative numbers. A
partial or invalid block SHALL be rejected. Configuration SHALL NOT provide a
queue path override.

#### Scenario: Queue command
- **WHEN** a repository contains a valid queue and associated change history
- **THEN** `osq queue` prints its complete deterministic filesystem-derived projection without modifying the queue

#### Scenario: Queue limit configuration
- **WHEN** queue planning limits are configured
- **THEN** both finite non-negative ceilings are available to planning through the public typed configuration

### Requirement: Next queue item planning
<!-- source: src/cli/plan.ts, src/cli/index.ts, src/core/new.ts, src/core/queue.ts, tests/queue-plan.test.ts, tests/queue-watch.test.ts -->
The planning command SHALL accept either ordinary `osq plan <name>` behavior or
`osq plan --next [--replan] [--print]`. Next mode SHALL select exactly the first
unplanned queue item in file order whose queue dependencies are landed, create
one numerically identified folder using the queue slug, seed its proposal title
and numeric archived dependency ids, and write the item body to `brief.md` with
`queue_item` and `queue_hash` metadata before entering the existing planning
flow.

Numeric allocation SHALL consider active, archived, and rejected folders.
Print mode SHALL create the change and emit the prompt without launching a
planner or recording a planning session. The planner context SHALL identify
the selected item and landed dependency archive paths without exposing later
queue items or the complete queue file.

#### Scenario: One eligible item
- **WHEN** `plan --next` finds an unplanned item whose dependencies are landed
- **THEN** exactly one correctly named and seeded change enters the same print or interactive flow as ordinary planning

#### Scenario: No eligible item
- **WHEN** every queue item is active, landed, rejected without replan permission, or waiting on an unlanded dependency
- **THEN** planning explains why nothing is eligible and creates no change

### Requirement: Queue planning safety and spend gates
<!-- source: src/cli/plan.ts, src/core/queue.ts, src/core/config.ts, tests/queue-plan.test.ts, tests/queue-budget.test.ts, tests/queue-watch.test.ts -->
Before mutating state, next-item planning SHALL refuse while any active
queue-associated change has a dead or regressed task or change target, naming
the target and its exact retry command. A rejected first eligible item SHALL
require `--replan`; replanning SHALL preserve all rejected history.

A non-print `plan --next` SHALL require configured queue ceilings. It SHALL
refuse when another session would exceed `maxPlanningSessions`, counting valid
planning starts across active, archived, and rejected queue changes. It SHALL
sum only finite cost from correlated exits and enforce `maxPlanningCost` only
when every counted session has recorded cost. Incomplete cost coverage SHALL
print a note and disable only the cost gate. All refusals SHALL occur before
folder creation, planning-log append, or harness spawn.

#### Scenario: Failed queue change
- **WHEN** an active queue change has an active dead or regressed target
- **THEN** next-item planning refuses before mutation and prints `osq retry <id> <task|change>`

#### Scenario: Rejected queue item
- **WHEN** the first otherwise eligible item has rejected history
- **THEN** next-item planning requires `--replan` and preserves every rejected attempt

#### Scenario: Planning ceiling
- **WHEN** the next session would exceed the session ceiling or complete recorded cost has reached the cost ceiling
- **THEN** next-item planning refuses before mutation

#### Scenario: Incomplete cost coverage
- **WHEN** any counted planning session lacks finite recorded cost
- **THEN** planning prints that the cost ceiling is not enforced while retaining the session gate

### Requirement: Verification placeholder guidance
<!-- source: AGENTS.md, README.md, fixture/**, tests/fixtures/** -->
Consumer guidance SHALL identify the generated
`node -e "process.exit(0)"` verify value as a planning sentinel that must be
replaced before approval. Checked-in executable fixtures SHALL use deterministic
local verification commands backed by their own fixture files rather than the
sentinel, network access, a TTY, or the repository's full verification suite.

#### Scenario: Generated placeholder is documented
- **WHEN** a planner or consumer reads repository guidance after creating a change
- **THEN** the guidance states that placeholder verification is rejected by lint and must be replaced with a final-tree command

#### Scenario: Checked-in fixture verification
- **WHEN** fixture change artifacts are inspected or executed from their fixture root
- **THEN** every verify command invokes real deterministic local behavior available within that fixture

### Requirement: Scope resolver upgrade guidance
<!-- source: README.md, tests/scope-resolver-upgrade.test.ts -->
Consumer guidance SHALL contain one `Upgrading` note explaining that resolver 2
changes automated done-marker hashes for active changes. It SHALL state that
the watcher runs each affected task's verification at detection, writes one
idempotent scope-regression marker, and requires the human to review it and run
`osq retry <id> <task>` for recertification.

The guidance SHALL state that archived markers are untouched and SHALL NOT
suggest editing markers, bypassing verification, automatic acceptance, or bulk
retry.

#### Scenario: Upgrading with active legacy completions
- **WHEN** a user upgrades while an active change has automated done markers without `scope_resolver: 2`
- **THEN** README explains the one-time detection wave and the explicit retry command that recertifies each task

#### Scenario: Archived completion history
- **WHEN** a user reads the resolver upgrade note
- **THEN** it states that markers already under the archive are not rewritten or audited by the migration

### Requirement: Managed tool-native planning entry points
<!-- source: src/core/foundation/init-blocks.ts, src/core/foundation/init.ts, src/core/foundation/doctor-managed.ts, templates/**, AGENTS.md, PLANNER.md, .claude/commands/osq-plan.md, tests/init.test.ts, tests/managed-blocks.test.ts -->
`osq init` SHALL manage `.claude/commands/osq-plan.md`, taking the change slug
as its argument, and a `Planning a change` section inside the existing osq block
in `AGENTS.md`. The Claude command SHALL use the existing osq start/end markers.
The Claude command SHALL direct the tool to read and follow `plan-prompt.md` in
the change folder. The `AGENTS.md` planning section SHALL direct planners to
`PLANNER.md` and SHALL name `plan-prompt.md` in the change folder as the
complete prompt when `osq plan` started the session. Both entry points SHALL
direct the tool to write only inside that folder, run `osq lint <slug>` and fix
every finding, and never run `osq approve`.
The managed `PLANNER.md` template SHALL state the same read, write-boundary,
lint, and no-approval rules in its own wording. Repeated initialization SHALL
refresh stale osq-managed bytes while preserving all content outside osq
markers and all unrelated existing files. AGY SHALL use the shared AGENTS block
unless a separate project-instruction contract is confirmed.
`osq doctor` SHALL require both the Claude command and AGENTS planning section
to be present and current, reporting an actionable managed-instructions failure
for missing, malformed, or stale content.

#### Scenario: Existing repository gains planning entry points
- **WHEN** `osq init` runs in an existing repository without the managed planning entry points
- **THEN** it installs current Claude and Codex instructions without changing unrelated files or content outside osq markers

#### Scenario: Managed planning content drifts
- **WHEN** either entry point is missing or differs from the installed osq content
- **THEN** doctor fails its managed-instructions check and a repeated init repairs the drift

#### Scenario: Planner reaches AGENTS.md without a handoff
- **WHEN** a planner reads the `AGENTS.md` planning section in an interactive session
- **THEN** it is sent to `PLANNER.md`, and `plan-prompt.md` is named only for sessions `osq plan` started

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

### Requirement: Proposal seed template
<!-- source: templates/proposal.md, src/core/foundation/new.ts, tests/new.test.ts -->
`osq new` SHALL seed `proposal.md` with the planning sentinel `verify` in
frontmatter and the body sections `## Goal`, `## Verify`, `## Non-goals`,
`## Contract`, `## Human steps`, and `## Delta`, in that order. The contract
placeholder SHALL be a `### Requirement:` block with a `#### Scenario:`, not a
table. The seed SHALL NOT mention retired `features.writes`. The built-in
fallback used when the template file is unreadable SHALL carry the same
sections.

#### Scenario: New change proposal
- **WHEN** `osq new <name>` creates a change
- **THEN** its `proposal.md` has the six sections in order, a requirement-and-scenario contract placeholder, and `verify: node -e "process.exit(0)"` in frontmatter

#### Scenario: Template unreadable
- **WHEN** the packaged `templates/proposal.md` cannot be read
- **THEN** the fallback proposal has the same six sections in the same order

### Requirement: Executor protocol constants and result headings
<!-- source: src/core/foundation/init-blocks.ts, AGENTS.md, .opencode/agent/osq-coder.md, tests/managed-blocks.test.ts -->
The step lines of the managed `## Executing a task` section and the body lines
of `## Exiting` SHALL be exported constants in
`src/core/foundation/init-blocks.ts`, and `MANAGED_AGENTS_MD_BODY` SHALL be
assembled from them. `## Exiting` SHALL name the result headings `## Changed`,
`## Deviated`, `## Missing context`, and `## Next` in that order, tell the
executor to leave out empty ones, and require a final `Touched:` line listing
every changed file other than the result file.

#### Scenario: Result headings defined once
- **WHEN** `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** it contains every exported executor step line and every exported exit line verbatim, and the exit lines name `## Changed`, `## Deviated`, `## Missing context`, `## Next`, and `Touched:`

#### Scenario: Repository copies stay current
- **WHEN** the managed block in the repository's `AGENTS.md` or `.opencode/agent/osq-coder.md` is inspected
- **THEN** it equals `MANAGED_AGENTS_MD_BODY`

### Requirement: Harness agent file diagnostics
<!-- source: src/core/foundation/doctor-managed.ts, src/core/foundation/doctor.ts, tests/doctor-agent-file.test.ts -->
When the configured execution harness or planner harness is `opencode`, the
doctor `managed-blocks` check SHALL also inspect
`.opencode/agent/<opencode.agent>.md`, the executor agent file `osq setup`
writes, against the managed `AGENTS.md` block. A missing file, or a missing,
partial, reversed, duplicated, or stale block, SHALL fail the check with a
message that names the file and names `osq setup` as the fix. Other harnesses
SHALL NOT require the file.

#### Scenario: Stale opencode agent file
- **WHEN** the harness is `opencode` and the agent file's managed block differs from the managed `AGENTS.md` block
- **THEN** the `managed-blocks` check fails with a message naming the agent file and `run osq setup`

#### Scenario: Current opencode agent file
- **WHEN** the harness is `opencode` and the agent file holds the current managed block
- **THEN** the agent file does not fail the `managed-blocks` check

#### Scenario: Other harness
- **WHEN** neither the execution harness nor the planner harness is `opencode` and no agent file exists
- **THEN** the agent file does not affect the `managed-blocks` check

### Requirement: One proposal format
<!-- source: templates/proposal.md, templates/openspec/schemas/osq/templates/proposal.md, templates/openspec/schemas/osq/schema.yaml, templates/openspec/config.yaml, src/core/foundation/init-blocks.ts, tests/proposal-format.test.ts -->
The osq schema's proposal template SHALL be byte-identical to
`templates/proposal.md`, the template `osq new` writes. The schema's proposal
instruction and the proposal rules in `templates/openspec/config.yaml` SHALL
name the sections Goal, Verify, Non-goals, Surface, Contract, Human steps, and
Delta in that order, the frontmatter `verify` command, and `features.reads`,
and SHALL NOT ask for Why, What Changes, Capabilities, or Impact sections.
The template's `## Surface` section SHALL hold an HTML comment naming the
categories commands, flags, config keys, frontmatter fields, document sections,
dead reasons, and event types, followed by the line `None`. The managed
`PLANNER.md` block SHALL tell the planner to fill `## Surface` after
`## Non-goals`, list the same categories, and allow a single `None`.

#### Scenario: Both proposal entry points agree
- **WHEN** the schema's proposal template and `templates/proposal.md` are compared
- **THEN** they are byte-identical

#### Scenario: Instruction matches the planner
- **WHEN** the schema's proposal instruction and the managed `PLANNER.md` block are inspected
- **THEN** both name `## Goal`, `## Non-goals`, `## Surface`, and `## Human steps`, and the instruction contains no `What Changes` or `Capabilities` section

#### Scenario: Seeded surface section
- **WHEN** `osq new` seeds a proposal
- **THEN** its `## Surface` section follows `## Non-goals`, precedes `## Contract`, and holds the categories comment followed by `None`

### Requirement: Repository runs the scaffolded OpenSpec schema
<!-- source: openspec/config.yaml, openspec/schemas/osq/**, tests/proposal-format.test.ts -->
The osq repository SHALL carry `openspec/config.yaml` and
`openspec/schemas/osq/**` byte-identical to the files under
`templates/openspec/` that `osq init` scaffolds, so the repository's own
changes and living specs validate under the schema users get.

#### Scenario: Dogfood copy stays current
- **WHEN** the repository's `openspec/config.yaml` and `openspec/schemas/osq/` files are compared with `templates/openspec/`
- **THEN** both sides hold the same file set and every file is byte-identical

### Requirement: Scaffolded schema refresh
<!-- source: src/core/foundation/init.ts, src/cli/init.ts, src/cli/index.ts, README.md, tests/init-refresh-schema.test.ts -->
`osq init --refresh-schema` SHALL overwrite `openspec/config.yaml`,
`openspec/schemas/osq/schema.yaml`, `openspec/schemas/osq/README.md`, and
`openspec/schemas/osq/templates/{proposal,spec,tasks}.md` from the installed
templates when their bytes differ, and SHALL print each replaced file as
`refreshed`. Files that already match SHALL stay untouched and print as
`current`, and missing files SHALL be created as usual. Everything else init
does SHALL stay the same. Without the flag, `osq init` SHALL behave and print
exactly as before.

#### Scenario: Stale consumer schema
- **WHEN** a scaffolded schema file differs from the installed template and the consumer runs `osq init --refresh-schema`
- **THEN** the file equals the installed template and init prints it as `refreshed`

#### Scenario: Current schema
- **WHEN** every scaffolded schema file already matches the installed templates
- **THEN** `osq init --refresh-schema` rewrites none of them and prints each as `current`

#### Scenario: Plain init leaves the schema alone
- **WHEN** `osq init` runs without the flag on an initialized project
- **THEN** it reports the schema files as `exists` and leaves them unchanged

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

### Requirement: Serve export flag
<!-- source: src/cli/serve.ts, src/cli/index.ts, README.md, tests/serve-export.test.ts -->
`osq serve --export <dir>` SHALL call the dashboard export for the current
project, print the written directory and a reminder that only the project root
and home directory paths were scrubbed, and exit 0 without binding a port or
opening a browser. A refused or failed export SHALL print its reason and exit
1. Without `--export`, `osq serve` SHALL behave as before.

#### Scenario: Export and exit
- **WHEN** a user runs `osq serve --export ./demo` in a project
- **THEN** the snapshot is written to `./demo`, the output names it and the scrub reminder, and no server starts

#### Scenario: Refused target
- **WHEN** `./demo` already contains files
- **THEN** the command prints the refusal and exits 1

### Requirement: Pi configuration and resolution
<!-- source: src/core/foundation/config*.ts, src/core/foundation/harness-catalog.ts, src/index.ts, tests/pi/** -->
Configuration SHALL accept harness `pi` and a publicly exported `PiConfig` with
optional non-empty `bin`, `provider`, `model`, and `thinking` strings, and SHALL
reject blank or non-string values naming the key. The binary SHALL resolve from
`pi.bin`, then `OSQ_PI_PATH`, then `pi`. The model SHALL resolve from
`pi.model`, then `OSQ_MODEL` only when Pi is the executor, then Pi's native
default. Effort SHALL be `pi.thinking` or null. The catalog entry SHALL declare
`planner.agent` unsupported.

#### Scenario: Explicit settings win
- **WHEN** `pi.bin` and `pi.model` are set and `OSQ_PI_PATH` and `OSQ_MODEL` are also set
- **THEN** osq uses `pi.bin` and `pi.model`

#### Scenario: Blank setting
- **WHEN** `pi.provider` is an empty string
- **THEN** configuration fails with a message naming `pi.provider`

### Requirement: Pi diagnostics
<!-- source: src/core/foundation/doctor.ts, src/core/foundation/harness-catalog.ts, src/core/foundation/config-pi.ts, tests/pi/** -->
A catalog entry MAY declare an optional `diagnose` hook, and doctor SHALL run
it after a passing `harness` check without naming any harness. For Pi it SHALL
add a `harness-version` check that warns, without failing, outside
`>=0.87.0 <0.88.0`, and, when `pi.provider` is set, a `harness-auth` check that
runs `pi auth check --provider <name> --json` and fails unless the status is
`ready`, printing the provider and reason.

#### Scenario: Not ready
- **WHEN** doctor runs with `pi.provider: 'deepseek'` and the auth check prints `not_ready` with reason `credentials_not_configured`
- **THEN** the `harness-auth` check fails naming `deepseek` and `credentials_not_configured`

#### Scenario: Untested version
- **WHEN** `pi --version` prints `0.88.0`
- **THEN** the `harness-version` check passes with a warning naming `0.88.0` and the tested range

#### Scenario: No provider
- **WHEN** `pi.provider` is not set
- **THEN** doctor runs no auth check

### Requirement: Pi consumer guidance
<!-- source: README.md -->
The README SHALL describe the Pi harness: its settings and their precedence,
installation, the tested version range, credentials and `pi auth check`, that
setup writes no Pi files because Pi reads `AGENTS.md`, the flags osq passes,
that Pi has no sandbox or permission prompts, and that Pi cannot plan.

#### Scenario: Reading the Pi section
- **WHEN** a consumer reads the README's Pi section
- **THEN** it finds a config example with placeholder provider and model, and an honest statement that task scope is a protocol, not confinement

### Requirement: Planning measurement configuration
<!-- source: src/core/foundation/config-planning.ts, src/core/foundation/config.ts, src/index.ts, tests/config-planning.test.ts -->
Configuration SHALL contain a `planning` block with `idleGapMinutes`, a
positive finite number defaulting to 10, and optional `prices`, a map from model
id to non-negative finite USD prices per million `input`, `output`,
`cacheRead`, and `cacheWrite` tokens. A partial block SHALL keep the defaults,
and an invalid value SHALL be rejected with a diagnostic naming its key.

#### Scenario: Default planning configuration
- **WHEN** no `planning` block is configured
- **THEN** resolved configuration has `planning.idleGapMinutes` 10 and no prices

#### Scenario: Price table
- **WHEN** `planning.prices` names a model with all four prices
- **THEN** resolved configuration keeps that entry and the default idle gap

#### Scenario: Invalid planning value
- **WHEN** `planning.idleGapMinutes` is zero or negative, or a price is negative, missing, or not a number
- **THEN** configuration validation fails naming the offending key

### Requirement: Planner verify start guidance
<!-- source: PLANNER.md, templates/PLANNER.md, src/core/foundation/init-blocks.ts, README.md, tests/verify-starts-docs.test.ts -->
The managed planner block SHALL state that a task whose verify names a test it
creates declares `verify_starts: red`, that a new test file may share a verify
with existing tests, and that `any` is only for a task that can honestly start
either way. README SHALL name the `verify_path_missing` dead reason among the
automatic retry reasons and the dead reasons, and the `verify_starts_conflict`
approval flag.

#### Scenario: Planner block guidance
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it states the `red` rule for a task that creates the test its verify names, allows a new test next to existing ones in one verify, and limits `any` to honest either-way starts

#### Scenario: README names the new reason and flag
- **WHEN** README is inspected
- **THEN** `verify_path_missing` appears in the automatic retry bullet and the dead reasons list, and `verify_starts_conflict` appears with the approval flags
