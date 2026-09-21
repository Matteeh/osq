# cli-foundation Specification

## Purpose

Provides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, and npm package distribution.

## Requirements

### Requirement: Configuration loading and schema validation
<!-- source: features/cli-foundation.md # Configuration, tests/config.test.ts -->
The system SHALL load operational configuration from `osq.config.ts` merged over `DEFAULT_CONFIG` using the `defineConfig` helper.

#### Scenario: Default configuration resolution
- **WHEN** no `osq.config.ts` exists in the project root
- **THEN** system defaults harness to `agy`, maxConcurrency to 1, maxScopeFiles to 8, and timeouts to standard limits

#### Scenario: Environment variable overrides
- **WHEN** `OSQ_HARNESS` or `OSQ_MODEL` is set in the process environment or `.env`
- **THEN** system overrides the corresponding configuration values

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
<!-- source: features/cli-foundation.md # Distribution & Release Management, tests/package-hygiene.test.ts, tests/bin-execution.test.ts, tests/release-workflow.test.ts -->
The system SHALL package exclusively compiled artifacts and legal metadata for npm distribution.

#### Scenario: Runtime executable version resolution
- **WHEN** `osq --version` is executed from the compiled binary
- **THEN** system dynamically reads version from `package.json` matching release metadata

### Requirement: Code ownership
<!-- source: osq.config.ts, src/cli/**, src/core/config*.ts, src/core/doctor.ts, src/core/harness-catalog.ts, src/core/init.ts, src/core/logger.ts, src/core/retry.ts, src/core/reject.ts, src/index.ts, templates/**, README.md, .env.example -->
The CLI Foundation capability SHALL own CLI entrypoints, retry and rejection
commands, configuration and shared harness capability resolution, doctor
diagnostics, logger, initialization, public configuration exports, templates,
and consumer guidance.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for CLI or configuration files
- **THEN** system maps `osq.config.ts`, `src/cli/**`, `src/core/config*.ts`, `src/core/doctor.ts`, `src/core/harness-catalog.ts`, `src/core/init.ts`, `src/core/logger.ts`, `src/core/retry.ts`, `src/core/reject.ts`, `src/index.ts`, `templates/**`, `README.md`, and `.env.example` to cli-foundation

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
<!-- source: src/cli/doctor.ts, src/core/doctor.ts, tests/doctor.test.ts -->
The CLI SHALL provide a doctor command that validates configuration, harness binary availability, managed blocks, lock states, archive integrity, and the pinned OpenSpec validator.

#### Scenario: Doctor passes on healthy repository
- **WHEN** user executes `osq doctor` in a properly configured repository with the pinned validator
- **THEN** command prints one status line per check (`config`, `harness`, `managed-blocks`, `locks`, `archives`, `validator`) and exits with code 0

#### Scenario: Doctor fails on check violation
- **WHEN** any diagnostic check fails (invalid config, missing harness binary, drift in managed blocks, orphaned locks, invalid archives, or validator drift)
- **THEN** command reports the failed check line and exits with code 1

#### Scenario: Doctor fails on validator drift
- **WHEN** the installed OpenSpec validator version differs from the pinned version
- **THEN** command reports a failing `validator` line describing version drift and exits with code 1

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
<!-- source: src/core/init.ts, README.md, AGENTS.md, tests/managed-blocks.test.ts -->
The project documentation and managed `AGENTS.md` block SHALL describe the OpenSpec layout and execution protocol, SHALL NOT reference retired paths (`features/`, `specs/`, or `drift against features`), and SHALL preserve foreign OpenSpec blocks during setup.

#### Scenario: Managed block contains no retired paths
- **WHEN** `AGENTS.md` or `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** neither contains references to `features/`, `specs/`, or `drift against features`

#### Scenario: Foreign OpenSpec block preserved during setup
- **WHEN** `osq setup` executes against an `AGENTS.md` containing an OpenSpec managed block
- **THEN** both `<!-- OPENSPEC:START -->` and `<!-- OSQ:START -->` blocks survive unchanged

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
<!-- source: PLANNER.md, templates/PLANNER.md, src/core/init.ts, tests/init-planner.test.ts -->
The managed planner block in `PLANNER.md`, `templates/PLANNER.md`, and `src/core/init.ts` SHALL encode slicing, detail, file tool, and change-level verify rules.

#### Scenario: Managed block encodes planner discipline
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it requires task verify commands to exercise complete slices through real entry points, forbids out-of-scope executor excuses, mandates acceptance lines and reuse names without signatures or numbered steps, requires file tool usage, and mandates change-level verify immediately following the goal

#### Scenario: Byte-equality test for planner templates
- **WHEN** `tests/init-planner.test.ts` executes
- **THEN** it asserts byte-for-byte equality between `PLANNER.md` managed block, `templates/PLANNER.md`, and `MANAGED_PLANNER_BLOCK` in `src/core/init.ts`

### Requirement: Planner configuration validation
<!-- source: src/core/config.ts, tests/config-planner.test.ts -->
The configuration subsystem SHALL support and validate an optional `planner` block defining `harness`, `model`, and optional `agent`.

#### Scenario: Rejection of invalid planner configuration
- **WHEN** `planner` is configured with an empty string or unrecognized harness
- **THEN** `defineConfig` throws a descriptive validation error

### Requirement: Opencode planner agent configuration
<!-- source: src/harness/opencode.ts, tests/opencode-planner-setup.test.ts -->
The setup command for the opencode harness SHALL generate `.opencode/agent/osq-planner.md` with restricted planning tool permissions.

#### Scenario: Planner agent permissions and idempotence
- **WHEN** `osq setup` executes with `opencode` harness configured
- **THEN** system generates `.opencode/agent/osq-planner.md` permitting `read`, `write`, `edit`, `glob`, `grep`, denying `bash`, `git`, `webfetch`, `websearch`, and repeated runs remain byte-identical

### Requirement: Interactive planning command
<!-- source: src/cli/plan.ts, src/cli/index.ts, tests/plan.test.ts -->
The CLI SHALL provide `osq plan <name> [--brief <file> | -] [-print]` to initialize changes, record briefs, and launch interactive planner sessions.

#### Scenario: New change interactive planning session
- **WHEN** user executes `osq plan <name>`
- **THEN** system creates change folder, writes `brief.md` with planner and date metadata, formats prompt with 4 ordered sections (`PLANNER.md`, change ID/title, capability spec paths, `brief.md`), and spawns an interactive session

#### Scenario: Resuming existing change planning session
- **WHEN** user executes `osq plan <id>` on an existing change folder with `brief.md`
- **THEN** system skips folder creation and launches an interactive session for the existing change

#### Scenario: Print mode outputs prompt to stdout
- **WHEN** user executes `osq plan <name> -print`
- **THEN** opening prompt is written exclusively to stdout without launching an interactive process

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
<!-- source: src/core/harness-catalog.ts, src/core/config*.ts, src/cli/plan.ts, tests/config-planner-catalog.test.ts -->
Planner validation SHALL derive supported harness names and optional-setting support from the canonical harness catalog while requiring a non-empty planner model. Planner selection SHALL use explicit planner configuration when present and otherwise the selected executor's catalog entry, without borrowing model, effort, or agent values from another harness.

#### Scenario: Supported planner configuration
- **WHEN** planner configuration supplies only settings supported by its selected catalog entry
- **THEN** validation returns normalized planner configuration and planning uses that harness's model and agent selection

#### Scenario: Unsupported planner setting
- **WHEN** planner configuration supplies an optional setting unsupported by its selected harness
- **THEN** validation fails with an error naming the harness and unsupported setting

#### Scenario: Implicit planner selection
- **WHEN** no planner block is configured
- **THEN** planning uses the selected executor's planner capabilities, records `default` for native model attribution when applicable, and passes no invented model override

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
target is a numeric task or the literal `change`. Retry SHALL require matching
approval, an active dead or regressed marker, and no running marker for the
target. It SHALL refuse all invalid states without mutation and SHALL direct a
missing or stale approval to `osq approve <id>` without approving on the
caller's behalf.

#### Scenario: Retrying a failed task
- **WHEN** a user retries an approved dead or regressed numeric task that is not running
- **THEN** the CLI performs the retry transition and reports its next execution attempt

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
