# cli-foundation Specification

## Purpose

Provides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, and npm package distribution.

## Requirements

### Requirement: Configuration loading and schema validation
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
The system SHALL initialize repository structure and agent instructions via `osq init` idempotently.

#### Scenario: First initialization in clean directory
- **WHEN** user executes `osq init`
- **THEN** system creates `openspec/`, `specs/`, config files, templates, and injects managed block into `AGENTS.md`

#### Scenario: Re-running initialization on existing repository
- **WHEN** user executes `osq init` on an existing project
- **THEN** system preserves existing files outside managed markers and reports existing paths as skipped

### Requirement: Change specification creation
The system SHALL prepare new change specifications via `osq new <name>`.

#### Scenario: Numbering and slugification
- **WHEN** user executes `osq new <name>`
- **THEN** system calculates the next 3-digit padded identifier from active and archived changes, creates a slugified directory, copies templates, and writes the title

### Requirement: Interactive terminal status line and log leveling
The logger SHALL render a single-line live animated status row on interactive TTY terminals without corrupting permanent logs.

#### Scenario: Interactive TTY rendering
- **WHEN** stderr is an interactive TTY, quiet mode is unset, and CI is unset
- **THEN** status row animates an 80ms spinner, truncates text to terminal width minus spinner prefix, and never applies `[osq]` prefix to status text

#### Scenario: Non-TTY and CI fallback
- **WHEN** stderr is not a TTY or `CI` environment variable is set
- **THEN** logger disables dynamic status animation and status calls become no-ops

### Requirement: Package hygiene and release distribution
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

### Requirement: Watch stale build and dev mode CLI options
The CLI watch command SHALL support options to bypass stale build detection and enable reactive dev execution.

#### Scenario: Stale build bypass flag
- **WHEN** user executes `osq watch --allow-stale`
- **THEN** CLI passes `allowStale: true` to the watch loop options

#### Scenario: Reactive dev mode flag
- **WHEN** user executes `osq watch --dev`
- **THEN** CLI passes `dev: true` to the watch loop options

### Requirement: Repository health diagnostics
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
The project scaffolding SHALL initialize and maintain a managed instructions block in `PLANNER.md`.

#### Scenario: Scaffolding creates or updates PLANNER.md
- **WHEN** user executes `osq init` in a repository
- **THEN** system ensures `PLANNER.md` exists and contains the current managed osq planner protocol between `<!-- OSQ:START -->` and `<!-- OSQ:END -->`

### Requirement: Canonical OpenSpec path layout
The engine SHALL derive all change folder and run artifact locations through a canonical layout module anchored to `openspecRoot`, removing redundant spec and archive path configurations.

#### Scenario: Layout derivation from OpenSpec root
- **WHEN** change folders or `.run` artifact paths are resolved
- **THEN** paths derive deterministically from `openspecRoot` without referencing independent specs or archive path overrides

#### Scenario: Configuration schema excludes legacy paths
- **WHEN** configuration is validated or loaded
- **THEN** `paths.specs` and `paths.archive` are absent from `OsqPaths` and rejected by linting

### Requirement: Complete layout consumer cut-over
All CLI entrypoints and core workflow commands SHALL derive change and archive directory paths strictly through `src/core/layout.ts` without reading `config.paths.specs` or `config.paths.archive`.

#### Scenario: Status inspection resolves via layout
- **WHEN** user executes `osq status`
- **THEN** command resolves change folders from `getChangesDir(config.paths.openspecRoot, cwd)` and archive count from `getArchiveDir(config.paths.openspecRoot, cwd)`

#### Scenario: Show and report commands resolve via layout
- **WHEN** user executes `osq show` or `osq report`
- **THEN** commands locate spec folders and completed archives using canonical layout helpers

### Requirement: Managed block coexistence
The setup command and managed block updater SHALL preserve foreign OpenSpec managed blocks in `AGENTS.md` without corruption across repeated executions.

#### Scenario: Repeated setup preserves both managed blocks
- **WHEN** `osq setup` executes against an `AGENTS.md` containing `<!-- OPENSPEC:START -->`
- **THEN** both `<!-- OPENSPEC:START -->` and `<!-- OSQ:START -->` blocks survive unchanged across multiple runs

### Requirement: Canonical migration layout authority
The migration engine SHALL resolve target directory paths exclusively through `src/core/layout.ts`.

#### Scenario: Migration derives targets from layout module
- **WHEN** `osq migrate openspec` resolves target specs, changes, or archive folders
- **THEN** paths derive exclusively from `getSpecsDir`, `getChangesDir`, and `getArchiveDir`

### Requirement: OpenSpec layout initialization and template retirement
The project initialization command SHALL scaffold only `openspec/` directories and configuration files, and SHALL NOT create legacy `specs/` directories or `specs/_template/`.

#### Scenario: Scaffolding creates OpenSpec layout only
- **WHEN** user executes `osq init` in a clean directory
- **THEN** system creates `openspec/` directory structure and configuration, leaving `specs/` uncreated

#### Scenario: Legacy specs template absent
- **WHEN** repository scaffolding is inspected
- **THEN** `specs/_template/` does not exist

### Requirement: OpenSpec agent documentation and managed instructions block
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

### Requirement: Hand-placed done marker detection in doctor
The `osq doctor` command SHALL inspect all `.run/done/` markers across active change folders and fail if any marker lacks valid frontmatter.

#### Scenario: Hand-placed done marker reported as failure
- **WHEN** a done marker in an active change folder lacks valid automated (`scope_hash`) or manual (`manual: true`) frontmatter
- **THEN** `osq doctor` reports a failure identifying the invalid hand-placed marker

#### Scenario: Legitimate done markers pass
- **WHEN** all done markers possess valid automated or manual frontmatter
- **THEN** doctor done-markers check reports ok

### Requirement: Planner file tool protocol instruction
The managed planner instructions block in `PLANNER.md` and `src/core/init.ts` SHALL instruct planners to write files using the file tool rather than shell echo.

#### Scenario: Managed block includes file tool instruction
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** the text contains `Write files with the file tool, never through a shell echo.`

### Requirement: Planner protocol rules in documentation and templates
The managed planner block in `PLANNER.md`, `templates/PLANNER.md`, and
`src/core/foundation/init-blocks.ts` SHALL encode slicing, detail, file tool,
change-level verify, final-tree verification, and task file-ownership rules.
Every task verify SHALL exercise its complete slice through a real entrypoint
and remain safely re-runnable against the final tree of the completed change.
A file SHALL belong to one task unless a later task must extend it; that later
task SHALL be ordered after the first owner, SHALL have the file in its own
`scope`, and the proposal SHALL identify the shared file.
The block SHALL state interactive planning and the `osq plan` handoff as
separate modes sharing the write-boundary, lint, and no-approval rules. It SHALL
state that the watcher runs the change-level `verify` after every task, so tasks
that pass only together are one task; that when a later task whose `scope`
covers an earlier done task's file changed it, and nothing else touched the
file, the watcher recertifies the earlier task itself if its `verify` still
passes, while any other change to an earlier done task's resolved `scope`
halts the change until a human runs `osq retry`; that globs resolve again at
every audit; that a preexisting test changes only with `tests.modify: true` and
the file in `scope`; and that `osq lint` enforces the configured limits on
scope patterns and acceptance lines. The block SHALL NOT tell planners to list
an expected `osq retry` for a shared file.

#### Scenario: Managed block encodes planner discipline
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it requires complete real-entrypoint and final-tree verifies, forbids out-of-scope executor excuses, mandates acceptance lines and reuse names without signatures or numbered steps, requires single-task file ownership with ordered documented extensions, requires file tool usage, and places change-level verify immediately after the goal

#### Scenario: Managed block encodes between-task watcher rules
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** its task rules state the change-level verify after every task, automatic recertification of a file extended by a later task that has it in scope, the scope-overlap halt resolved by `osq retry` for any other change, glob re-resolution, and the `tests.modify` rule

#### Scenario: Byte-equality test for planner templates
- **WHEN** `tests/init-planner.test.ts` executes
- **THEN** it asserts byte-for-byte equality between the `PLANNER.md` managed block, `templates/PLANNER.md`, and `MANAGED_PLANNER_BLOCK` in `src/core/foundation/init-blocks.ts`

#### Scenario: No expected retry for a shared file
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it doesn't contain `list the expected \`osq retry\``

### Requirement: Planner configuration validation
The configuration subsystem SHALL support and validate an optional `planner` block defining `harness`, `model`, and optional `agent`.

#### Scenario: Rejection of invalid planner configuration
- **WHEN** `planner` is configured with an empty string or unrecognized harness
- **THEN** `defineConfig` throws a descriptive validation error

### Requirement: Opencode planner agent configuration
The setup command for the opencode harness SHALL generate `.opencode/agent/osq-planner.md` with restricted planning tool permissions.
The file SHALL use only OpenCode permission keys. Its `bash` permission SHALL be
an ordered pattern map that denies `*`, then allows `osq lint*`,
`pnpm osq lint*`, `npx osq lint*`, `osq spec*`, `pnpm osq spec*`, and
`npx osq spec*`, then denies any command containing a shell operator, so that
under OpenCode's last-match-wins rule the planner can run `osq lint` and
`osq spec` and no other shell command. Its body SHALL end with
`The only shell commands you may run are osq lint <slug> and osq spec.`, with
`osq lint <slug>` and `osq spec` in backticks. Setup SHALL NOT overwrite an
existing planner agent file, and the repository's own
`.opencode/agent/osq-planner.md` SHALL equal the generated file.

#### Scenario: Planner agent permissions and idempotence
- **WHEN** `osq setup` executes with `opencode` harness configured
- **THEN** system generates `.opencode/agent/osq-planner.md` permitting `read`, `edit`, `glob`, `grep`, denying `webfetch` and `websearch`, giving `bash` the lint and spec pattern map, and repeated runs remain byte-identical

#### Scenario: Chained lint command
- **WHEN** the planner's `bash` rules are evaluated against `osq lint 048 && rm -rf x`
- **THEN** the last matching rule denies it

#### Scenario: Spec command allowed
- **WHEN** the planner's `bash` rules are evaluated against `osq spec cli-foundation "Spec command"`, `pnpm osq spec cli-foundation`, and `osq spec cli-foundation; rm -rf x`
- **THEN** the first two are allowed and the last is denied

### Requirement: Interactive planning command
The CLI SHALL provide `osq plan <name> [--brief <file> | -] [--session | --print]`
and `osq plan --next [--session | --print]` to prepare an ordinary or
queue-selected change. Every mode SHALL build the same five ordered prompt
sections: complete `PLANNER.md`, change identity, capability spec paths,
complete brief, and `This repository's record` derived from the 20 most recent
archived changes under the established bounded rules. When the recent archived
changes hold any executor disclosure, every mode SHALL add a sixth section,
`## Recent executor disclosures`, after the record.

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

#### Scenario: Disclosures section
- **WHEN** a recent archived change's result file holds a real disclosure section
- **THEN** every planning mode's prompt ends with `## Recent executor disclosures` after the repository record, and a prompt without disclosures is unchanged

### Requirement: Codex configuration and resolution
The configuration subsystem SHALL support harness codex and publicly exported CodexConfig with optional non-empty bin, model, and effort strings, preserving existing harness defaults. Codex binary resolution SHALL use explicit codex.bin, then CODEX_PATH, then codex. Executor model resolution SHALL use explicit codex.model, then OSQ_MODEL only for a Codex executor, then native Codex defaults. Effort SHALL use explicit codex.effort or native defaults.

#### Scenario: Explicit configuration wins
- **WHEN** explicit Codex settings and environment fallbacks both exist
- **THEN** osq uses explicit settings without borrowing another harness's model

#### Scenario: Native defaults
- **WHEN** Codex model and effort have no applicable configuration
- **THEN** osq omits their CLI overrides and does not invent a resolved model

### Requirement: Codex setup and diagnostics
The system SHALL support Codex setup through the shared managed AGENTS procedure without generating harness-specific configuration or credentials. Doctor SHALL probe the configured Codex execution binary with --version, resolving it identically to the adapter. Optional harnessPreflightSeconds and harnessKillGracePeriodMs timeout fields SHALL preserve existing timeout-object compatibility and use centrally configured defaults.

#### Scenario: Idempotent mixed-harness setup
- **WHEN** Codex is the executor, planner, or both and setup runs repeatedly
- **THEN** shared instructions and foreign managed blocks coexist, consumer Codex files remain intact, no Codex files are created, and the other selected adapter is also set up where applicable

#### Scenario: Failed binary probe
- **WHEN** the resolved Codex executable is missing, returns nonzero, or exceeds its configured preflight deadline
- **THEN** doctor reports an actionable failing harness check and exits unsuccessfully

### Requirement: Codex planning selection
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

### Requirement: Canonical harness capability catalog
The configuration subsystem SHALL maintain one immutable catalog of supported harness names and shared capabilities for executable resolution, execution identity, effort attribution, and planner-agent support. Supported-name validation, available-name diagnostics, and shared harness resolution SHALL derive from this catalog without independent harness-name sets. Adapter factories SHALL be statically exhaustive over the catalog-derived harness name type.

#### Scenario: Consistent registered harness lookup
- **WHEN** a registered executor or planner harness is resolved with supported casing
- **THEN** configuration validation, adapter lookup, available names, and shared metadata identify the same catalog entry

#### Scenario: Catalog and adapter factory parity
- **WHEN** a catalog entry lacks an adapter factory or a factory lacks a catalog entry
- **THEN** type checking or registry contract tests fail

### Requirement: Capability-driven planner validation
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
Repository health diagnostics SHALL resolve the selected executor's external executable through the canonical harness catalog and probe it with the configured deadline. A catalogued harness that declares no external executable SHALL pass the harness diagnostic without spawning a process.

#### Scenario: External harness diagnostic
- **WHEN** doctor checks a registered harness with an external executable
- **THEN** it probes the catalog-resolved command and reports its version or an actionable missing, nonzero, or timeout failure

#### Scenario: No-binary harness diagnostic
- **WHEN** doctor checks a registered harness declaring no external executable
- **THEN** the harness check succeeds without a process probe

### Requirement: Generic harness consumer guardrails
Generic configuration, diagnostics, planning, manifest, and watcher consumers SHALL NOT select behavior through comparisons or fallback expressions naming individual first-party harnesses. Architecture validation SHALL derive forbidden generic-consumer name branches from the canonical catalog rather than a separately maintained harness list.

#### Scenario: Harness-specific generic branch
- **WHEN** a generic consumer introduces a semantic branch or cross-harness fallback naming a catalogued harness
- **THEN** architecture validation fails

#### Scenario: Future first-party harness
- **WHEN** a future first-party harness is added
- **THEN** generic consumers require no harness-specific branch changes

### Requirement: Append-only planning session lifecycle
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
The planning command SHALL accept either ordinary `osq plan <name>` behavior or
`osq plan --next [--replan] [--print]`. Next mode SHALL select exactly the first
unplanned queue item in file order whose queue dependencies and fixed items are
landed, create one numerically identified folder using the queue slug, seed its
proposal title, numeric archived dependency ids, and the numeric archived ids of
the items it fixes as `fixes`, and write the item body to `brief.md` with
`queue_item` and `queue_hash` metadata before entering the existing planning
flow. A proposal seeded without fixes SHALL carry no `fixes` key.

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

#### Scenario: Item that fixes a landed item
- **WHEN** the selected item carries `Fixes: first-item` and `first-item` landed as change 007
- **THEN** the new proposal's frontmatter carries `fixes: ["007"]`

#### Scenario: Fixed item not landed
- **WHEN** an item's `Fixes:` names an item that has not landed
- **THEN** the item waits as it would on an unlanded dependency and the queue lists the fixed slug among its unmet dependencies

### Requirement: Queue planning safety and spend gates
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

### Requirement: Proposal seed template
`osq new` SHALL seed `proposal.md` with the planning sentinel `verify` in
frontmatter and the body sections `## Goal`, `## Verify`, `## Non-goals`,
`## Contract`, `## Human steps`, and `## Delta`, in that order. The contract
placeholder SHALL be a `### Requirement:` block with a `#### Scenario:`, not a
table. The seeded `## Human steps` SHALL read `None`, and the osq schema's
instruction SHALL say the section never includes `osq approve`. The seed SHALL
NOT mention retired `features.writes`. The built-in fallback used when the
template file is unreadable SHALL carry the same sections.

#### Scenario: New change proposal
- **WHEN** `osq new <name>` creates a change
- **THEN** its `proposal.md` has the six sections in order, a requirement-and-scenario contract placeholder, `## Human steps` reading `None`, and `verify: node -e "process.exit(0)"` in frontmatter

#### Scenario: Template unreadable
- **WHEN** the packaged `templates/proposal.md` cannot be read
- **THEN** the fallback proposal has the same six sections in the same order

### Requirement: Executor protocol constants and result headings
The step lines of the managed `## Executing a task` section and the body lines
of `## Exiting` SHALL be exported constants in
`src/core/foundation/init-blocks.ts`, and `MANAGED_AGENTS_MD_BODY` SHALL be
assembled from them. `## Exiting` SHALL name the result headings `## Changed`,
`## Deviated`, `## Missing context`, `## Outside scope`, `## Blocked`, and
`## Next` in that order, tell the executor to leave out empty ones, and require
a final `Touched:` line listing every changed file other than the result file.
Each disclosure heading's purpose SHALL name who reads it: `## Deviated` is what
the executor did differently from the task, for the reviewer; `## Missing
context` is what the task lacked, for the planner; `## Outside scope` is what
the executor found broken outside its scope and left alone, for the human.
`## Blocked` is what the executor needs before the task can be finished within
its scope, for the human.

Step 2 SHALL read exactly: `2. Can't finish within your task's scope, or too big
for one pass? Write what you need under ## Blocked in .run/results/<n>.md, and
exit without code.`, with `scope`, `## Blocked`, and `.run/results/<n>.md` in
backticks.

#### Scenario: Result headings defined once
- **WHEN** `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** it contains every exported executor step line and every exported exit line verbatim, and the exit lines name `## Changed`, `## Deviated`, `## Missing context`, `## Outside scope`, `## Blocked`, `## Next`, and `Touched:`

#### Scenario: Repository copies stay current
- **WHEN** the managed block in the repository's `AGENTS.md` or `.opencode/agent/osq-coder.md` is inspected
- **THEN** it equals `MANAGED_AGENTS_MD_BODY`

#### Scenario: Disclosure headings name their reader
- **WHEN** the exit lines are inspected
- **THEN** `## Deviated` names the reviewer, `## Missing context` names the planner, and `## Outside scope` names the human

#### Scenario: Blocked stop
- **WHEN** step 2 and the exit lines are inspected
- **THEN** step 2 tells an executor that can't finish within its scope to write `## Blocked` and exit without code, and `## Blocked` names the human

### Requirement: Harness agent file diagnostics
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
The osq schema's proposal template SHALL be byte-identical to
`templates/proposal.md`, the template `osq new` writes. The schema's proposal
instruction and the proposal rules in `templates/openspec/config.yaml` SHALL
name the sections Goal, Verify, Non-goals, Surface, Decisions, Assumptions,
Contract, Human steps, and Delta in that order, the frontmatter `verify`
command, and `features.reads`, and SHALL NOT ask for Why, What Changes,
Capabilities, or Impact sections. The template's `## Surface` section SHALL
hold an HTML comment naming the categories commands, flags, config keys,
frontmatter fields, document sections, dead reasons, and event types, followed
by the line `None`. The template's `## Decisions` section SHALL hold an HTML
comment describing decision lines and departure lines, followed by the line
`None`. The template's `## Assumptions` section SHALL hold an HTML comment
asking for one line per assumption the plan rests on that the human should
check before approving, followed by the line `None`. The managed `PLANNER.md`
block SHALL tell the planner to fill `## Surface` after `## Non-goals`, list
the same categories, and allow a single `None`, and to write `## Assumptions`
after `## Decisions` as `None` or one line per assumption.

#### Scenario: Both proposal entry points agree
- **WHEN** the schema's proposal template and `templates/proposal.md` are compared
- **THEN** they are byte-identical

#### Scenario: Instruction matches the planner
- **WHEN** the schema's proposal instruction and the managed `PLANNER.md` block are inspected
- **THEN** both name `## Goal`, `## Non-goals`, `## Surface`, and `## Human steps`, and the instruction contains no `What Changes` or `Capabilities` section

#### Scenario: Seeded surface section
- **WHEN** `osq new` seeds a proposal
- **THEN** its `## Surface` section follows `## Non-goals`, precedes `## Contract`, and holds the categories comment followed by `None`

#### Scenario: Seeded decisions section
- **WHEN** `osq new` seeds a proposal
- **THEN** its `## Decisions` section follows `## Surface`, precedes `## Contract`, and holds a comment followed by `None`

#### Scenario: Seeded assumptions section
- **WHEN** `osq new` seeds a proposal, or the template file is unreadable and the fallback seeds it
- **THEN** its `## Assumptions` section follows `## Decisions`, precedes `## Contract`, and holds a comment followed by `None`

### Requirement: Repository runs the scaffolded OpenSpec schema
The osq repository SHALL carry `openspec/config.yaml` and
`openspec/schemas/osq/**` byte-identical to the files under
`templates/openspec/` that `osq init` scaffolds, so the repository's own
changes and living specs validate under the schema users get.

#### Scenario: Dogfood copy stays current
- **WHEN** the repository's `openspec/config.yaml` and `openspec/schemas/osq/` files are compared with `templates/openspec/`
- **THEN** both sides hold the same file set and every file is byte-identical

### Requirement: Scaffolded schema refresh
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
The README SHALL describe the Pi harness: that `osq init` scaffolds it as the
default harness, its settings and their precedence, installation, the tested
version range, credentials and `pi auth check`, that setup writes no Pi files
because Pi reads `AGENTS.md`, the flags osq passes, that Pi has no sandbox or
permission prompts so nothing confines its agent, and that Pi cannot plan.

#### Scenario: Reading the Pi section
- **WHEN** a consumer reads the README's Pi section
- **THEN** it finds a config example with placeholder provider and model, and an honest statement that task scope is a protocol, not confinement

### Requirement: Planning measurement configuration
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

### Requirement: Claude configuration and resolution
Configuration SHALL accept harness `claude` and a publicly exported
`ClaudeConfig` with optional non-empty `bin` and `model` strings and an
optional boolean `sandbox`, and SHALL reject any other value naming the key.
The binary SHALL resolve from `claude.bin`, then `claude`. The model SHALL
resolve from `claude.model`, then `OSQ_MODEL` only when Claude is the executor,
then Claude Code's native default. Effort SHALL be null. The catalog entry
SHALL declare `planner.agent` unsupported.

#### Scenario: Explicit settings win
- **WHEN** `claude.model` is set and `OSQ_MODEL` is also set
- **THEN** osq uses `claude.model`

#### Scenario: Invalid setting
- **WHEN** `claude.sandbox` is the string `"yes"` or `claude.bin` is an empty string
- **THEN** configuration fails with a message naming that key

### Requirement: Claude diagnostics
The `claude` catalog entry SHALL declare a `diagnose` hook that adds a
`harness-version` check failing when `claude --version` is below 2.1.278,
naming the version and the minimum. Its `containment` SHALL pass and say that
file tools are confined to the project and `git` is denied, and that Bash is
sandboxed with no network when `claude.sandbox` is true or unconfined with
open network otherwise; doctor reports it as the `harness-containment` check.
Claude preflight SHALL fail before any task spawns on the same version
condition.

#### Scenario: Old version
- **WHEN** `claude --version` prints `2.1.200 (Claude Code)`
- **THEN** doctor's `harness-version` check fails naming `2.1.200` and `2.1.278`, and preflight fails before any task spawns

#### Scenario: Containment report
- **WHEN** doctor runs with `claude.sandbox: true`
- **THEN** the `harness-containment` check says that Bash is sandboxed without network, that file tools are confined to the project, and that `git` is denied

### Requirement: Claude consumer guidance
The README SHALL describe the Claude Code harness: a config example, its
settings, the minimum version, login versus `ANTHROPIC_API_KEY` and `--bare`,
the stripped tool surface and why, the permission baseline and `git` denial,
`claude.sandbox` with its bubblewrap and socat requirement on Linux, the
honest limits of containment without the sandbox, and that planning uses the
tool-native command instead.

#### Scenario: Reading the Claude section
- **WHEN** a consumer reads the README's Claude Code section
- **THEN** it finds the flags osq passes and a statement that without `claude.sandbox` Bash is not confined

### Requirement: Active change folder entries
`isActiveChangeFolderName` in `src/core/status/layout.ts` SHALL decide which
changes directory entries are active change folders: every name except those
starting with `_` or `.` and the archive and rejected folders. The watcher cycle
and bare `osq lint` SHALL list change folders through it.

#### Scenario: Watcher skips the rejected folder
- **WHEN** the watcher runs a cycle and the changes directory holds `archive` and `rejected` beside an approved change
- **THEN** it logs no watcher error for either folder and runs the approved change's task

#### Scenario: Bare lint skips the rejected folder
- **WHEN** `osq lint` runs without ids and the changes directory holds `rejected` beside a valid change
- **THEN** it lints only the valid change, reports no finding that names `rejected`, and exits 0

### Requirement: Planner finish and approval handoff
The managed planner block SHALL tell an interactive planner to read what it
needs and then write the change folder, stopping after the task list only when
the human asks to review it first and then saying the folder is not written
yet. It SHALL tell every planner to finish by telling the human, in chat, the
task titles, that the change folder is written and `osq lint` passes, and the
exact `osq approve <id>` to run, and SHALL say the human should not approve
before that message. It SHALL say `## Human steps` never includes
`osq approve`.

#### Scenario: Planner block states the handoff
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it contains no instruction to stop after the task list by default, contains the finishing message with the exact `osq approve <id>`, and says `## Human steps` never includes `osq approve`

### Requirement: Planner delta guidance
The managed planner block SHALL say that guidance a task needs about another
capability's code, such as how to test against it, goes into that capability's
spec through a delta, not only into the task. It SHALL say that replacing a
requirement's behavior is a REMOVED requirement plus an ADDED one, because a
MODIFIED requirement must keep every scenario it already has and `osq lint` and
archive refuse one that drops any.

#### Scenario: Planner block states delta guidance
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it names the other-capability delta rule and the REMOVED plus ADDED rule with its reason

### Requirement: Executor start and ownership wording
Executor step 3 SHALL say that a `verify` naming a file the task creates fails
until that file exists, so starting red is expected. The managed `AGENTS.md`
line about `tasks.md` and `.run/` SHALL be addressed to executors and SHALL say
planners write `tasks.md` and the task files.

#### Scenario: Executor block states the start and ownership rules
- **WHEN** `MANAGED_AGENTS_MD_BODY` or an executor prompt is inspected
- **THEN** step 3 explains the expected red start and the ownership line names executors as the ones who never edit those files and planners as the writers of the task files

#### Scenario: Old blocks refreshed
- **WHEN** `osq init` runs on a project whose `AGENTS.md` and `PLANNER.md` hold the previous managed blocks
- **THEN** both blocks are replaced with the current ones and `osq doctor` reports no managed-block drift

### Requirement: Plan prompt spec list label
The plan prompt's `## Capability Specs` section SHALL start with the sentence
`All living specs. Read the requirements this change writes or whose code it
uses, not whole specs: osq spec <capability> lists them and osq spec
<capability> <requirement> prints one.`, with both `osq spec` commands in
backticks, and SHALL still list every living spec.

#### Scenario: Labeled spec list
- **WHEN** a plan prompt is built for a project with living specs
- **THEN** its `## Capability Specs` section starts with that sentence and lists every `openspec/specs/<capability>/spec.md`

### Requirement: Planning price diagnostics
`osq doctor` SHALL add a `planning-prices` check only when a model named by the
`plan_started` record of a planning session with recorded tokens, in any active
or archived change, has no `planning.prices` entry. The check SHALL pass with a
warning and name each missing key exactly, such as
`planning.prices["claude-opus-5-5"]`, in sorted model order. With no such model
the check list SHALL be unchanged.

#### Scenario: Missing price entry
- **WHEN** an archived change recorded planning tokens from `claude-opus-5-5` and `planning.prices` has no entry for it
- **THEN** doctor prints a `[warn]` `planning-prices` line naming `planning.prices["claude-opus-5-5"]` and still exits zero

#### Scenario: Every model priced
- **WHEN** every model with recorded planning tokens has a price entry, or none recorded tokens
- **THEN** doctor prints no `planning-prices` line

### Requirement: Plan handoff next step
The one line the `osq plan` prompt handoff prints SHALL end with
` — next: <next step>` for the change it hands off.

#### Scenario: Fresh handoff
- **WHEN** `osq plan <name>` hands off a new change 021
- **THEN** its one line ends with ` — next: unplanned — osq plan 021`

### Requirement: Approve refusal next step
When `osq approve <id>` fails for a change whose folder exists, the
`CommandError` it throws SHALL carry that change's next step as `next`, so
`runCli` prints `Next: <next step>` to stdout after the error. When the folder
does not exist, `next` SHALL be unset and no `Next:` line SHALL print.

#### Scenario: Approving a template
- **WHEN** `osq approve 021` runs on a change that still has the placeholder verify
- **THEN** it fails and prints `Next: unplanned — osq plan 021`

#### Scenario: Error before the next step
- **WHEN** `osq approve 021` fails that way
- **THEN** its `Error approving 021:` line on stderr is printed before its `Next:` line on stdout

### Requirement: Planner human steps guidance
The planner block and osq schema SHALL tell planners to split `## Human steps`
into `### Before approval` and `### After landing`, with steps during the run
under Before approval. They SHALL say that after-landing steps are notes that
nothing waits on, and that a check osq can run goes in `check: <command>` in
the proposal frontmatter, which osq runs after the change-level verify at
archive and again when `osq land` merges a newer default branch. Neither
SHALL name `osq verified`.

#### Scenario: Planner block names the subsections
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it names `### Before approval`, `### After landing`, and `check: <command>`, and does not contain `osq verified`

### Requirement: Import graph lint limits
`limits` SHALL carry `importGraphDepth`, default 2, the import levels the
frozen-test warning follows, and `maxListedImporters`, default 8, the most tests
or files one import-graph warning lists. Both SHALL merge from `osq.config.ts`
like the other limits, and the README's lint table SHALL list the four
import-graph warnings.

#### Scenario: Deeper reach
- **WHEN** `limits.importGraphDepth` is 3 and a test imports a scoped file three levels away
- **THEN** the frozen-test warning names that test

### Requirement: Architecture decision records
osq SHALL read ADRs from the markdown files directly under `paths.decisions`,
leaving out `README.md`, through one module, `src/core/foundation/decisions.ts`,
that every other part of osq uses. A file whose YAML frontmatter has a `status`
key SHALL be an ADR. Any other markdown file SHALL be ignored and listed as
ignored. An ADR's number SHALL be the leading digits of its file name, as
written, such as `007`, and ADR numbers SHALL compare by numeric value, so
`ADR 7` names `007`. Its title SHALL be its first `# ` heading without a
leading `<number>.`. Its date SHALL be the first `YYYY-MM-DD` on the first
body line that starts with `Date:`, or null when no such line or date exists.
Frontmatter SHALL carry `status`, one of `proposed`,
`accepted`, or `superseded`; `applies_to`, either `all` or a list of
capability names; `rule`, one sentence saying what a spec must do; and, on a
superseded ADR, `superseded_by`, the number of its replacement. Only accepted
ADRs SHALL take effect. An accepted ADR SHALL govern a change when it applies
to `all` or names a capability the change writes. A missing decisions folder
SHALL read as no ADRs.

#### Scenario: Frontmatter ADR
- **WHEN** `decisions/007-ui-framework.md` has frontmatter `status: accepted`, `applies_to: all`, `rule: UI components use React.` and the heading `# 007. UI framework`
- **THEN** osq reads ADR `007` titled `UI framework`, applying to all, with that rule

#### Scenario: Plain markdown ADR
- **WHEN** a file under the decisions folder has no frontmatter
- **THEN** it is listed as ignored and takes no effect

#### Scenario: ADR date
- **WHEN** an ADR's body has the line `Date: 2026-09-18. Revised: 2026-09-26.` under its heading
- **THEN** osq reads its date as `2026-09-18`

#### Scenario: ADR without a date
- **WHEN** an ADR's body has no line starting with `Date:`, or that line holds no `YYYY-MM-DD`
- **THEN** its date reads as null and the ADR is otherwise read as before

### Requirement: Architecture decision validation
Validation SHALL report an error for an ADR whose `status` is not one of the
three values, an accepted ADR without a valid `applies_to`, an accepted ADR
whose `rule` is missing, spans more than one line, or is longer than
`limits.maxRuleLength` characters, and a superseded ADR whose `superseded_by`
is missing or names no existing ADR. It SHALL report a warning for each
ignored file and for each capability name in `applies_to` that has no living
spec, since the capability may not exist yet.

#### Scenario: Rule too long
- **WHEN** an accepted ADR's rule is one character longer than `limits.maxRuleLength`
- **THEN** validation reports an error naming the ADR and the limit

#### Scenario: Future capability
- **WHEN** an accepted ADR applies to `ingress` and no living spec named `ingress` exists
- **THEN** validation reports a warning, not an error

### Requirement: Project rules block
`osq init` SHALL write a project rules block into AGENTS.md between
`<!-- OSQ:RULES:START -->` and `<!-- OSQ:RULES:END -->`, directly before the
`<!-- OSQ:START -->` managed block and separated from it by one blank line.
The block SHALL hold the heading `## Project rules`, a blank line, and one line
per accepted ADR that applies to all, in number order, each reading
`- <rule> ADR <number>`, such as `- UI components use React. ADR 007`. With no
such ADR the block SHALL be absent, and `osq init` SHALL remove one that
exists. Writing the block SHALL never change AGENTS.md content outside its
markers, including the osq managed block, and a second run SHALL change
nothing.

#### Scenario: Two system-wide rules
- **WHEN** ADRs 003 and 007 are accepted and apply to all, and `osq init` runs twice
- **THEN** AGENTS.md holds one rules block with the 003 line before the 007 line, directly before the managed block, and the second run leaves the file byte-identical

#### Scenario: Superseded rule
- **WHEN** ADR 003 becomes superseded by accepted system-wide ADR 008 and `osq init` runs
- **THEN** the 003 line is gone and the 008 line is present

### Requirement: Decisions doctor check
`osq doctor` SHALL add a `decisions` check, after `managed-blocks`, when the
decisions folder holds a markdown file other than `README.md` or AGENTS.md
holds a rules marker. The check SHALL fail on any validation error, on a rules
block that doesn't match the accepted ADRs, saying to run `osq init`, and on
more system-wide rules than `limits.maxProjectRules`, naming the limit. With no
failure, it SHALL pass with a warning when at least one validation warning
exists or no accepted ADR applies to `all`. The warning SHALL list each
ignored file and unknown capability, then, when no accepted ADR applies to
`all`, `no accepted ADR applies to all; write the architecture and style ADRs
first`, joined with `; `. Without ADR files or a rules marker, the check list
SHALL be unchanged.

#### Scenario: Stale block
- **WHEN** a new accepted system-wide ADR is added and `osq init` has not run
- **THEN** doctor prints `[fail] decisions:` with a message naming `osq init`, and passes after `osq init`

#### Scenario: Ignored file
- **WHEN** the decisions folder holds one ADR with frontmatter and one without
- **THEN** doctor prints a `[warn] decisions:` line naming the file without frontmatter and exits zero

#### Scenario: No system-wide ADR
- **WHEN** a project's only ADR is the proposed starter from `osq init`
- **THEN** doctor prints `[warn] decisions: no accepted ADR applies to all; write the architecture and style ADRs first` and exits zero

#### Scenario: System-wide ADR accepted
- **WHEN** the starter is accepted with a `rule` and `osq init` has written the rules block
- **THEN** the `decisions` check passes with no warning

### Requirement: Plan prompt architecture decisions
When the project has at least one accepted ADR, the plan prompt SHALL carry an
`## Architecture Decisions` section after `## Capability Specs` and before
`## Brief`. It SHALL start with the sentence
`Read in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.`
and list each accepted ADR in number order as
`- ADR <number>: <title>. Applies to: <all, or capability names joined by ", ">. Rule: <rule> Path: <repository-relative path>`.
Proposed and superseded ADRs SHALL NOT appear. Without an accepted ADR the
section SHALL be absent.

#### Scenario: Accepted and superseded ADRs
- **WHEN** ADR 003 is superseded and ADRs 007 and 009 are accepted
- **THEN** the section lists 007 and 009 with their scopes, rules, and paths, and does not mention 003

### Requirement: Planner decisions guidance
The managed `PLANNER.md` block SHALL tell the planner to write `## Decisions`
after `## Surface`, with one line per accepted ADR that governs a capability
the change writes saying what the decision means for this change, to name a
system-wide ADR only to depart from it, to start a departure line with
`Departs from ADR <n>:` and give the reason, to treat a needed departure as a
reason for a new ADR, to write `None` when no ADR governs the change, and to
repeat a rule in a task only when that task touches the area.

#### Scenario: Planner block names the section
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it names `## Decisions`, `Departs from ADR <n>:`, and `None`

### Requirement: Decision limits
`limits` SHALL carry `maxRuleLength`, default 160, the most characters an
accepted ADR's rule may have, and `maxProjectRules`, default 10, the most
system-wide rules the AGENTS.md block may hold. Both SHALL merge from
`osq.config.ts` like the other limits.

#### Scenario: Configured rule length
- **WHEN** `osq.config.ts` sets `limits.maxRuleLength` to 40
- **THEN** an accepted ADR with a 41-character rule fails validation naming 40

### Requirement: Decision checks and denied packages
ADR frontmatter MAY carry `checks`, a list of repository-relative test files
that enforce the decision, and `denies`, a list of package names the decision
forbids. Each ADR SHALL read both as lists, empty when the field is missing,
with each check path trimmed, using forward slashes, and without a leading
`./`. Validation SHALL report an error for a field that is not a list of
non-empty strings. Only accepted ADRs' checks and denied packages SHALL take
effect.

#### Scenario: Checks and denies read
- **WHEN** an accepted ADR has `checks: [./tests/adapter-imports.test.ts]` and `denies: [vue, "@vue/runtime-core"]`
- **THEN** it reads checks `tests/adapter-imports.test.ts` and denies `vue` and `@vue/runtime-core`

#### Scenario: Malformed denies
- **WHEN** an ADR has `denies: vue`
- **THEN** validation reports an error naming the ADR and `denies`

### Requirement: Decision check files in doctor
The `decisions` doctor check SHALL fail when a check file named by an accepted
ADR doesn't exist, naming the ADR and the file. A missing check file on a
proposed or superseded ADR SHALL NOT fail it.

#### Scenario: Missing check file
- **WHEN** accepted ADR 009 names `tests/adapter-imports.test.ts` and the file doesn't exist
- **THEN** doctor prints `[fail] decisions:` naming ADR 009's path and `tests/adapter-imports.test.ts`

### Requirement: Traceability configuration
`osq.config.ts` MAY set `traceability.capabilities` to `'all'` or a list of
capability names, and `traceability.mode` to `warn` or `require`. The resolved
config SHALL always hold `traceability`, defaulting to
`{ capabilities: [], mode: 'warn' }`, with a partial block keeping each
missing default. `defineConfig` SHALL throw
`traceability.capabilities must be 'all' or a list of capability names` or
`traceability.mode must be one of warn, require` for any other value.

#### Scenario: Default opts nothing in
- **WHEN** `osq.config.ts` has no `traceability` block
- **THEN** the resolved config holds `{ capabilities: [], mode: 'warn' }`

#### Scenario: Invalid mode
- **WHEN** `traceability.mode` is `strict`
- **THEN** `defineConfig` throws `traceability.mode must be one of warn, require`

### Requirement: Testing package subpath
`package.json` SHALL export `./testing`, with `types` at
`./dist/testing/index.d.ts` and `import` at `./dist/testing/index.js`, beside
the existing `.` export. It SHALL add no runtime dependency.

#### Scenario: Subpath resolves after build
- **WHEN** `pnpm build` has run
- **THEN** both files the `./testing` export names exist

### Requirement: Traceability instruction blocks
When at least one capability is opted in, `osq init` SHALL write a block
between `<!-- OSQ:TRACEABILITY:START -->` and `<!-- OSQ:TRACEABILITY:END -->`
directly after the managed block's `<!-- OSQ:END -->` line. It goes in
PLANNER.md and in AGENTS.md, or at the end of a file without a managed block.
With none opted in, `osq init` SHALL remove any such block and leave both files
otherwise unchanged. `<scope>` below is `every capability` for `'all'` and
otherwise the opted-in names joined by `, `.

The PLANNER.md block SHALL read:

```
## Traceability

Traceability covers <scope>.

- Under `## Scenarios` in each task, list the scenarios its tests prove as `- <capability>: <scenario name>`, and scope their test files.
- Give a scenario with more than one case a table of exact inputs and outputs directly under its THEN.
- Put every test that names a modified scenario in its task's scope with `tests.modify: true`; `osq lint` lists them.
- Have exported functions tagged with `@scenario` and `@adr`.
```

The AGENTS.md block SHALL read:

```
## Traceability

For <scope>:

- Prove each scenario with `import { scenario } from '@matteeh/osq/testing'` and `scenario('<capability>', '<scenario name>', { covers: fn }, ({ run, then, each }) => ...)`, with literal names. Call `fn` only through `run`.
- Take expected values from the scenario's THEN lines and tables, never from running the code.
- Check a table with `each`. Check a rule that holds for every input with a property test inside `then`.
- Tag each exported function you add or change in a doc comment directly above `export function` or `export const <name> = (...) =>`: one `@scenario <capability>: <scenario name>` line per scenario it serves and one `@adr <number>` line per decision it follows.
```

`osq doctor` SHALL fail with
`` <file> traceability block is missing; run `osq init` ``,
`` <file> traceability block is out of date; run `osq init` ``, or
`` <file> has an unexpected traceability block; run `osq init` ``
when either file's block differs from the canonical one.

#### Scenario: Opted in
- **WHEN** `traceability.capabilities` is `['pricing']` and `osq init` runs
- **THEN** AGENTS.md and PLANNER.md each hold their block naming `pricing`, directly after `<!-- OSQ:END -->`

#### Scenario: Not opted in
- **WHEN** no capability is opted in and `osq init` runs
- **THEN** AGENTS.md and PLANNER.md are byte for byte what they were before this change, and `osq doctor` reports no traceability problem

### Requirement: Focused test command
`traceability.focusedTests` in `osq.config.ts` MAY hold a command containing
`{files}`. It is unset by default, and the resolved `traceability` block SHALL
leave it out when unset. Any other value SHALL make `defineConfig` throw
`traceability.focusedTests must be a command containing {files}`. osq documents
`node --test --test-reporter=tap {files}` as the reference command.

#### Scenario: Unset by default
- **WHEN** `osq.config.ts` sets `traceability.capabilities` but not `focusedTests`
- **THEN** the resolved `traceability` block has no `focusedTests`

#### Scenario: Missing placeholder
- **WHEN** `traceability.focusedTests` is `node --test`
- **THEN** `defineConfig` throws `traceability.focusedTests must be a command containing {files}`

### Requirement: Mutation configuration
`traceability.mutation` in `osq.config.ts` MAY hold `command`, a non-empty
string, and `budgetSeconds`, a positive number that defaults to 300. Setting
the block turns the mutation check on for opted-in capabilities. The resolved
`traceability` block SHALL leave `mutation` out when it is unset. `defineConfig`
SHALL throw `traceability.mutation.command must be a non-empty command` or
`traceability.mutation.budgetSeconds must be a positive number` for any other
value.

#### Scenario: Off by default
- **WHEN** `osq.config.ts` sets `traceability.capabilities` but no `mutation`
- **THEN** the resolved `traceability` block has no `mutation`

#### Scenario: Budget defaults
- **WHEN** `traceability.mutation` is `{ command: 'npx stryker run' }`
- **THEN** the resolved block holds that command and `budgetSeconds: 300`

### Requirement: Reference mutation setup
README.md SHALL document the reference StrykerJS setup: `@stryker-mutator/core`
as a dev dependency of the project, `traceability.mutation.command` set to
`npx stryker run`, and this `stryker.config.mjs`:

```
const tests = JSON.parse(process.env.OSQ_MUTATION_TESTS ?? '[]')
  .map((file) => `'build/${file.replace(/\.(m|c)?ts$/, (_, k) => `.${k ?? ''}js`)}'`)
  .join(' ');
export default {
  testRunner: 'command',
  commandRunner: { command: `node --test ${tests}` },
  buildCommand: 'npx tsc',
  mutate: JSON.parse(process.env.OSQ_MUTATE ?? '[]'),
  coverageAnalysis: 'off',
  reporters: ['json'],
  jsonReporter: { fileName: process.env.OSQ_MUTATION_REPORT },
  tempDirName: '.stryker-tmp',
};
```

It SHALL say that the config assumes `tsc` compiles `tests/` to `build/tests/`
and must follow the project's own layout. It SHALL say to leave
`thresholds.break` unset, and to add `.stryker-tmp` to `.gitignore`.

#### Scenario: Setup documented
- **WHEN** a reader looks up mutation checks in README.md
- **THEN** it shows the command, the config above, and the placeholders and environment variables osq provides

### Requirement: Git read timeout
`timeouts.gitSeconds` in `osq.config.ts` SHALL bound each git read osq makes,
and SHALL default to 10 seconds when unset.

#### Scenario: Timeout unset
- **WHEN** `osq.config.ts` sets no `timeouts.gitSeconds`
- **THEN** each git read is bounded by 10 seconds

### Requirement: Doctor git check
`osq doctor` SHALL print a `git` line after the `validator` line. It SHALL pass
with git's version when `GitVcs` is selected, and SHALL pass with a warning
that names the reason git checks are off otherwise. When any of `GIT_DIR`,
`GIT_INDEX_FILE` or `GIT_WORK_TREE` is set in osq's environment, doctor SHALL
add a `git-env` line that passes with a warning naming each variable set, and
saying that osq's own git reads ignore them while verify commands and hooks
do not. Neither line SHALL change doctor's exit code.

#### Scenario: Repository root
- **WHEN** doctor runs at the top level of a git repository
- **THEN** it prints `[ok] git:` followed by git's version

#### Scenario: Git absent
- **WHEN** doctor runs and the git binary cannot be found
- **THEN** it prints `[warn] git: git not found; git checks off` and its exit code is unchanged

#### Scenario: GIT_DIR set
- **WHEN** doctor runs with `GIT_DIR` set
- **THEN** it prints a `[warn] git-env:` line naming `GIT_DIR`

### Requirement: osq's own decision records validate
Every ADR in osq's `decisions/` SHALL carry osq frontmatter. Reading the folder
and validating it against osq's living specs SHALL yield no ignored file, no
error, and no warning, and `checkProjectRules` SHALL report no error for osq's
AGENTS.md. `decisions/README.md` SHALL describe the frontmatter format. The
test of these records SHALL NOT pin ADR numbers, statuses, or which ADRs apply
to all.

#### Scenario: Own ADRs validate
- **WHEN** osq's own decisions folder is read and validated against its living specs
- **THEN** it yields at least one ADR, no ignored file, no error, and no warning, and the rules block check reports no error

#### Scenario: One more ADR
- **WHEN** a copy of osq's decisions folder and AGENTS.md gains a valid accepted ADR that applies to all, and `writeRulesBlock` refreshes the copy's rules block
- **THEN** the same checks report no error and no warning

### Requirement: Baseline verify configuration
`gates.baselineVerify` in `osq.config.ts` MAY name the command the watcher
runs as a change's baseline. When set, it SHALL be a non-empty string after
trimming, and validation SHALL keep it trimmed. When it is unset,
`validateGatesConfig` SHALL leave the key out of its result, and no baseline
SHALL run.

#### Scenario: Command set
- **WHEN** `osq.config.ts` sets `gates: { baselineVerify: ' pnpm verify ' }`
- **THEN** the loaded gates carry `baselineVerify: 'pnpm verify'`

#### Scenario: Empty command
- **WHEN** `osq.config.ts` sets `gates: { baselineVerify: '  ' }`
- **THEN** loading fails with `gates.baselineVerify must be a non-empty command`

### Requirement: Version control configuration
`osq.config.ts` MAY carry a `vcs` block. `enabled` SHALL be a boolean and
default to false. `author`, when set, SHALL have the form `Name <email>`, and
SHALL be required when `enabled` is true. `worktreeRoot`, `prepare`, and
`defaultBranch`, when set, SHALL be non-empty strings after trimming, kept
trimmed. A loaded config SHALL always carry `vcs`. `timeouts.gitCommitSeconds`
MAY bound each commit osq makes, and SHALL default to 120 when unset.

#### Scenario: Block unset
- **WHEN** `osq.config.ts` has no `vcs` block
- **THEN** the loaded config carries `vcs: { enabled: false }`

#### Scenario: Enabled without an author
- **WHEN** `osq.config.ts` sets `vcs: { enabled: true }`
- **THEN** loading fails with `vcs.author is required when vcs.enabled is true`

#### Scenario: Malformed author
- **WHEN** `osq.config.ts` sets `vcs: { author: 'osq' }`
- **THEN** loading fails with `vcs.author must look like "Name <email>"`

#### Scenario: Default branch trimmed
- **WHEN** `osq.config.ts` sets `vcs: { defaultBranch: ' trunk ' }`
- **THEN** the loaded config carries `defaultBranch: 'trunk'`, and a blank `defaultBranch` fails with `vcs.defaultBranch must be a non-empty string if provided`

### Requirement: Doctor version control warnings
With `vcs.enabled` and `GitVcs` selected, `osq doctor` SHALL add a passing
warning line after the `git` line for each of these that holds: `vcs-prepare`
when the project root has `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`,
`bun.lock`, or `bun.lockb` and `vcs.prepare` is unset; `git-hooks` naming each
active commit hook; and `git-signing` when `commit.gpgsign` is true. With
`vcs.enabled` off, none of them SHALL appear, and none SHALL change doctor's
exit code.

#### Scenario: Lockfile without prepare
- **WHEN** doctor runs with `vcs.enabled`, a `pnpm-lock.yaml`, and no `vcs.prepare`
- **THEN** it prints a `[warn] vcs-prepare:` line naming `pnpm-lock.yaml`

#### Scenario: Pre-commit hook
- **WHEN** doctor runs with `vcs.enabled` in a repository with an executable `pre-commit` hook
- **THEN** it prints a `[warn] git-hooks:` line naming `pre-commit`

#### Scenario: Flag off
- **WHEN** doctor runs with `vcs.enabled` off in that same repository
- **THEN** it prints no `vcs-prepare`, `git-hooks`, or `git-signing` line

### Requirement: Config file errors
When `osq.config.ts`, `osq.config.js`, or `osq.config.mjs` exists and fails to
import or validate, `loadConfig` SHALL reject with a `ConfigLoadError` whose
message is `Failed to load <absolute path>: <original message>`. It SHALL
import the file with jiti aliasing `@matteeh/osq` to the running osq's own
entry, `src/index` under `tsx` and `dist/index` once built. A project with no
config file SHALL load the defaults as before.

#### Scenario: Validation error
- **WHEN** `osq.config.ts` calls `defineConfig({ vcs: { author: 'osq' } })`
- **THEN** `loadConfig` rejects with a `ConfigLoadError` naming the file and `vcs.author must look like "Name <email>"`

#### Scenario: Import error
- **WHEN** `osq.config.ts` has a syntax error
- **THEN** `loadConfig` rejects with a `ConfigLoadError` naming the file

#### Scenario: Scaffolded config without node_modules
- **WHEN** a temporary project has only the `osq.config.ts` that `osq init` writes, with its `'pi'` replaced by `'codex'`, `OSQ_HARNESS` unset, and no `node_modules`
- **THEN** `loadConfig` resolves with harness `codex` from that file

#### Scenario: Doctor
- **WHEN** `osq doctor` runs with a config file that fails to validate
- **THEN** its `config` check fails with `failed to load: ` followed by the `ConfigLoadError` message

### Requirement: Config error exit
When any command rejects with a `ConfigLoadError`, the command line SHALL print
`Error: <message>` to stderr, without a stack trace, and set the exit code to
1 without ending the process. `osq init` SHALL load config like every other
command and SHALL NOT fall back to the defaults. Any other error that is not a
`CommandError` SHALL propagate as before.

#### Scenario: Status with a broken config
- **WHEN** `osq status` runs in a project whose config fails to validate
- **THEN** stderr holds `Error: Failed to load ` and the file, and the exit code is 1

#### Scenario: Init with a broken config
- **WHEN** `osq init` runs in that project
- **THEN** it prints the same error, exits 1, and scaffolds nothing

### Requirement: OpenCode diagnostics
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

### Requirement: Inbox dispatch command
`osq inbox` SHALL read the dispatch items, order them, and read the first
item's card, writing nothing. It SHALL print `Needs you (<n>):`, then one line
per item in order,
`  <position>. <kind> <id> <title>[ task <n>: <task title>] (<reason>)`,
then a blank line and the first item's card. The card SHALL start with
`<kind>: <folder>`, then `  why: <reason>`, then the card data for its kind,
then `Actions:` with one `  <command>` line per command. An empty inbox SHALL
print `Nothing needs you.` With `--json`, it SHALL print
`{ "watcherIdle": <bool>, "items": [...] }`, where each item holds its
kind, change, task, weight, reason, commands, and card. It SHALL exit zero.
Bare `osq` and `osq --json` SHALL be unchanged. `limits.cardOutputLines`
SHALL default to 20. When stdin and stdout are both terminals and neither
`--json` nor `--follow` is given, `osq inbox` SHALL run the card session
instead of printing, as "Inbox cards on a terminal" says.

#### Scenario: Ordered list and first card
- **WHEN** a project has a halt item and an approval item whose change two others depend on, and the watcher has no runnable change
- **THEN** `osq inbox` lists the approval first, then the halt, and prints the approval's card with its goal and `osq approve <id>` under `Actions:`

#### Scenario: JSON
- **WHEN** `osq inbox --json` runs on the same project
- **THEN** the output parses as JSON with `watcherIdle` true and two items that each carry a card

#### Scenario: Empty
- **WHEN** nothing needs a human
- **THEN** `osq inbox` prints `Nothing needs you.`

#### Scenario: Registered
- **WHEN** `createProgram` builds the CLI
- **THEN** it has an `inbox` command with a `--json` option, and bare `osq` still runs the attention inbox

### Requirement: Inbox configuration
`defineConfig` SHALL validate an optional `inbox` block over these defaults
and put the result on `OsqConfig.inbox`:

- `sound`: `default`. One of `default`, `bell`, `off`, or any other
  non-empty string, which is a sound file path relative to the project root.
- `quietHours`: `null`, or a string `HH:MM-HH:MM` in local time, where each
  hour is `00` to `23`, each minute `00` to `59`, and the two times differ.
- `soundWindowSeconds`: 5. A finite number zero or greater.
- `eventDebounceMs`: 200. A finite number zero or greater.
- `pollSeconds`: 30. A finite number greater than zero.

A partial block SHALL keep each missing value's default. Any other value
SHALL throw an error that names the key, such as `inbox.quietHours must be
HH:MM-HH:MM with two different times`. `parseQuietHours` SHALL return the
start and end as minutes after midnight. `src/index.ts` SHALL export the
`InboxConfig` type.

#### Scenario: Defaults
- **WHEN** `defineConfig({})` runs
- **THEN** `inbox` is `{ sound: 'default', quietHours: null, soundWindowSeconds: 5, eventDebounceMs: 200, pollSeconds: 30 }`

#### Scenario: Partial block
- **WHEN** `defineConfig({ inbox: { quietHours: '22:00-07:00' } })` runs
- **THEN** `inbox.quietHours` is `22:00-07:00` and the other four values are the defaults

#### Scenario: Invalid quiet hours
- **WHEN** `inbox.quietHours` is `25:00-07:00`, `22:00-22:00`, or `10pm-7am`
- **THEN** `defineConfig` throws an error naming `inbox.quietHours`

#### Scenario: Invalid poll interval
- **WHEN** `inbox.pollSeconds` is 0
- **THEN** `defineConfig` throws an error naming `inbox.pollSeconds`

#### Scenario: Invalid sound
- **WHEN** `inbox.sound` is an empty string or a number
- **THEN** `defineConfig` throws an error naming `inbox.sound`

#### Scenario: Loaded from the config file
- **WHEN** `osq.config.ts` sets `inbox: { sound: 'bell' }`
- **THEN** `loadConfig` returns `inbox.sound` as `bell`

### Requirement: Inbox follow flag
`osq inbox --follow` SHALL run the dispatch follow loop until interrupted,
with the inbox sound built from the config, and SHALL stop cleanly on
SIGINT. `inboxDispatchCommand` SHALL take `follow`, `signal`, `sound`,
`watch`, `schedule`, `every`, and `now` options so tests drive the loop
without a terminal, a real watcher, a real timer, or a real sound. With `--json`, `--follow` SHALL print
`osq inbox: --follow prints text; drop --json` to stderr and exit with
code 1. Without `--follow`, `osq inbox` and `osq inbox --json` SHALL print
what they printed before. `formatDispatchItemSummary` SHALL return
`<kind> <id> <title>[ task <n>: <task title>] (<reason>)`, the text that
follows the position on each line of `osq inbox`'s list.

README.md SHALL say, in the Human Attention Inbox section, what
`osq inbox --follow` prints, when it plays a sound, which players it tries,
and the five `inbox` config keys with their defaults. Its Commands list
SHALL include `osq inbox --follow`.

#### Scenario: Follow through the command
- **WHEN** `inboxDispatchCommand({ follow: true })` runs with a fake watcher, a recording sound, and a signal that aborts after one event
- **THEN** it prints `osq inbox`'s text, the waiting line, one line per new item, and resolves after the abort

#### Scenario: JSON refused
- **WHEN** `osq inbox --follow --json` runs
- **THEN** stderr holds `osq inbox: --follow prints text; drop --json` and the exit code is 1

### Requirement: osq runs its own changes under version control
osq's own `osq.config.ts` SHALL set `vcs.enabled` to true, `vcs.author` to
`osq <osq@noreply.invalid>`, and `vcs.prepare` to
`pnpm install --frozen-lockfile`. README.md SHALL end its
`## Version control` section with `### Working with version control on`, a
numbered list that says, in order, to approve from the default branch, to
find the worktree from the `Worktree:` line or under `vcs.worktreeRoot`, not
to edit the worktree while a task runs, and to land with `osq land <id>`,
which lands the change completely or changes nothing. The `## Version control`
section SHALL describe no way to land by hand.

#### Scenario: Own config
- **WHEN** `loadConfig` reads the repository root
- **THEN** `vcs.enabled` is true, `vcs.author` is `osq <osq@noreply.invalid>`, and `vcs.prepare` is `pnpm install --frozen-lockfile`

#### Scenario: Walkthrough
- **WHEN** README.md is read
- **THEN** `### Working with version control on` follows the other `## Version control` text and holds `osq land <id>`, and the `## Version control` section holds neither `git merge --squash` nor `| git commit -F -`

### Requirement: Inbox wait log wiring
`inboxDispatchCommand` SHALL take `home`, defaulting to `os.homedir()`.
The card session SHALL run with a recorder from
`createWaitRecorder(cwd, 'cards', { home, stderr })` and `--follow` with one
from `createWaitRecorder(cwd, 'follow', { home, stderr })`, and both SHALL
get `home` in their watch options. The printed and `--json` output SHALL
read through `readDispatch` and `readDispatchQueue` with `home`, and SHALL
write nothing.

#### Scenario: Session writes the log
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` true, scripted key `q`, a temporary home, and a project with one approval item
- **THEN** the wait log under the temporary home holds `start`, a `seen` for the approval with `unobserved: true`, `top`, `opened`, and `stop`

#### Scenario: Follow writes the log
- **WHEN** it runs with `follow` and a temporary home, and the signal aborts after the first derivation
- **THEN** the wait log under the temporary home holds a `start` with mode `follow` and a `stop`

#### Scenario: Printing writes nothing
- **WHEN** it runs with `isTerminal` false, and again with `json`, under a temporary home
- **THEN** nothing exists under the temporary home's `.osq`

#### Scenario: Printed order uses first seen
- **WHEN** the wait log under the temporary home has the higher of two equal approval items first seen earlier
- **THEN** the printed list shows the higher change id first

### Requirement: Traceability capability names
When `traceability.capabilities` is a list and the project holds at least
one living capability spec, `loadConfig` SHALL check every name in it after
the config is defined. A name SHALL pass when it has a living spec or when
a proposal under `<openspecRoot>/changes/<folder>/proposal.md`, outside the
archive, lists it in `creates`. Otherwise `loadConfig` SHALL throw
`traceability.capabilities names unknown capability <name>; did you mean <nearest>?`,
with `nearestCapability` giving the nearest name and the suffix left out
when there is none, wrapped as a `ConfigLoadError` naming the config file.
`'all'`, and a project with no living capability spec, SHALL pass
unchecked.

#### Scenario: Misspelled name
- **WHEN** a project with a living `pricing` spec sets `traceability.capabilities: ['pricng']`
- **THEN** `loadConfig` throws a `ConfigLoadError` whose message ends with `traceability.capabilities names unknown capability pricng; did you mean pricing?`

#### Scenario: Real name
- **WHEN** it sets `traceability.capabilities: ['pricing']`
- **THEN** `loadConfig` returns the config

#### Scenario: Created by an active change
- **WHEN** it sets `traceability.capabilities: ['gadgets']` and an active change's proposal lists `creates: [gadgets]`
- **THEN** `loadConfig` returns the config

#### Scenario: No living specs
- **WHEN** a project with no living capability spec sets `traceability.capabilities: ['pricing']`
- **THEN** `loadConfig` returns the config

### Requirement: Capability relation guidance
`MANAGED_PLANNER_BLOCK` SHALL hold, under `### Parent spec` and right before
the bullet that starts `- Replacing a requirement's behavior`, this bullet:

```
- Every change relates to a capability: it writes a delta or names one in
  `features.reads`, and every read names a living capability or one the
  change creates. List each new capability in `creates` in the proposal
  frontmatter. Never invent a capability to avoid touching an existing one.
```

`PLANNER.md` and `templates/PLANNER.md` SHALL hold the block between their
`OSQ:START` and `OSQ:END` markers. README.md SHALL show `creates` in the
`## Change folder` frontmatter example and say, after it, that every change
writes a delta or names a capability in `features.reads`, that every read
names a real capability, that a new capability is declared in `creates`,
that lint enforces this once the project has a living spec, and that
`traceability.capabilities` must name real capabilities.

#### Scenario: Planner bullet
- **WHEN** `MANAGED_PLANNER_BLOCK`, `PLANNER.md`, and `templates/PLANNER.md` are read with line wrapping collapsed
- **THEN** each holds the bullet, before the `Replacing a requirement's behavior` bullet

#### Scenario: README
- **WHEN** README.md is read
- **THEN** its `## Change folder` section holds `creates:` and the relation rule

### Requirement: Capability groups configuration
`osq.config.ts` MAY set `capabilities.requireGroups` to a boolean. The
resolved config SHALL always hold `capabilities`, defaulting to
`{ requireGroups: false }`, and a value that is not a boolean SHALL fail
with `capabilities.requireGroups must be a boolean`.

#### Scenario: Default
- **WHEN** a project's config sets no `capabilities`
- **THEN** the resolved `capabilities.requireGroups` is false

#### Scenario: Opt in
- **WHEN** it sets `capabilities: { requireGroups: true }`
- **THEN** the resolved `capabilities.requireGroups` is true

#### Scenario: Invalid
- **WHEN** it sets `capabilities: { requireGroups: 'yes' }`
- **THEN** defining the config fails with `capabilities.requireGroups must be a boolean`

### Requirement: Capability sidecar guidance
osq's own `osq.config.ts` SHALL set `capabilities.requireGroups` to true,
and every osq capability SHALL have a sidecar with the group the change
names: cli-foundation `platform`, spec-lint-and-approve and traceability
`planning`, watcher-and-harness and version-control `execution`, and
status-inspection, web-inspection, and metrics-and-reporting `inspection`.
README.md SHALL describe, in its `## Change folder` section, the sidecar
file and its keys, the `{ name, group }` form of `creates`, replacement
sidecars in a change, `capabilities.requireGroups` and what it enforces,
and `osq migrate sidecars`.

#### Scenario: Own sidecars
- **WHEN** every `openspec/specs/<capability>/osq.yml` in the repository is read with `parseSidecar`
- **THEN** each parses with the group named here, and `loadConfig` on the repository root gives `capabilities.requireGroups` true

#### Scenario: README
- **WHEN** README.md is read
- **THEN** its `## Change folder` section holds `osq.yml`, `requireGroups`, and `osq migrate sidecars`

### Requirement: Graph command
`osq graph --json` SHALL print `serializeWebJson` of `getSystemGraph` for the
current project, followed by a newline, to stdout. `osq graph` without
`--json` SHALL print three lines:

```
Nodes: <kind> <count>, ...
Edges: <kind> <count>, ...
Gaps: untested <n>, unclaimed <n>, unowned <n>
```

`Nodes` and `Edges` SHALL list only kinds with a count above zero, in the
order "System graph document" and "System graph links" list the kinds, with
`owns`, `proves`, `covers`, `serves`, and `follows` after `imports` in that
order. A failure, such as a config error, SHALL print its message to stderr
and exit one. The command SHALL write no file. The README's command list SHALL
name `osq graph`.

#### Scenario: JSON output
- **WHEN** `osq graph --json` runs in a fixture project
- **THEN** stdout parses to the same document `getSystemGraph` returns for that project

#### Scenario: Summary output
- **WHEN** `osq graph` runs in a project with two capabilities without sidecars, three requirements, and one unowned file
- **THEN** stdout starts with `Nodes: capability 2, requirement 3,` and its last line is `Gaps: untested 0, unclaimed 0, unowned 1`

### Requirement: Land command
`osq land <id>` SHALL run `landChange` for the id in the current directory,
print each of its lines to stdout, and exit with its code. It SHALL pass
`landChange` a progress callback that prints each progress line to stderr, so
stdout holds only the land's result. On a refusal or a stop it SHALL print
only the message to stderr and exit one. `landCommand` SHALL take the command
inputs, as `messageCommand` does, and SHALL load `osq.config.ts` inside its
error handling, so a configuration error prints its message and exits one. `createProgram` SHALL register it through
`registerLandCommand`, and the `doctor` command through
`registerDoctorCommand` in `src/cli/doctor.ts`, with its description and
behaviour unchanged.

#### Scenario: Land prints its lines
- **WHEN** `osq land <id>` lands an archived change
- **THEN** stdout holds `Landed <folder> as <commit>`, `Removed worktree <path>`, and `Kept branch osq/<folder>`, in that order and nothing else, and the exit code is zero

#### Scenario: Refusal on stderr
- **WHEN** `osq land <id>` refuses
- **THEN** stdout is empty, stderr holds the refusal, and the exit code is one

#### Scenario: Registered commands
- **WHEN** `osq --help` runs
- **THEN** it lists `land <id>` and `doctor`

#### Scenario: Progress on stderr
- **WHEN** `osq land <id>` syncs because the default branch moved
- **THEN** the sync's progress line is on stderr, and stdout holds only the land's result lines

### Requirement: osq's decisions index is complete
The index in osq's `decisions/README.md` SHALL link every ADR file in
`decisions/` exactly once, and no index link SHALL name a file that doesn't
exist. The test of the index SHALL NOT name an ADR number.

#### Scenario: Index lists every ADR
- **WHEN** the index in osq's `decisions/README.md` is read next to the ADR files in `decisions/`
- **THEN** every ADR file is linked exactly once, and every link names an ADR file that exists

### Requirement: Land message command
`osq message <id>` SHALL print the commit message that "Squash commit
message" builds to stdout, exactly and with nothing else. It is the message
`osq land <id>` commits. It SHALL then print `Branch: osq/<folder>` to stderr,
and nothing else there, and exit zero. On a refusal it SHALL print only the
refusal to stderr and exit one. It SHALL write no file and run no git command
that writes.

#### Scenario: Message is the land commit's message
- **WHEN** a change has archived in its worktree, `osq message <id>` prints its message, and `osq land <id>` then lands the change
- **THEN** the land commit's message equals that stdout, and `git interpret-trailers --parse` over it prints every trailer of "Squash commit message"

#### Scenario: Branch on stderr
- **WHEN** `osq message <id>` succeeds
- **THEN** stderr is exactly `Branch: osq/<folder>` and a newline, and stdout holds only the message

#### Scenario: Refusal
- **WHEN** `osq message <id>` refuses
- **THEN** stdout is empty, stderr holds the refusal, and the exit code is one

### Requirement: Sync command
`osq sync <id>` SHALL run `syncChange` for the id in the current directory,
print its line to stdout, and exit zero. It SHALL pass `syncChange` a progress
callback that prints each progress line to stderr, so stdout holds only the
result. On a refusal or a stop it SHALL print only the message to stderr and
exit one. `syncCommand` in `src/cli/sync.ts` SHALL take the command inputs,
as `landCommand` does, and SHALL load `osq.config.ts` inside its error
handling, so a configuration error prints its message and exits one. `createProgram` SHALL register it through
`registerSyncCommand` with the description `merge the default branch into a
change's branch`.

#### Scenario: Sync prints its line
- **WHEN** `osq sync <id>` merges the default branch into an active change's branch
- **THEN** stdout holds only `Synced osq/<folder> with main`, stderr holds the progress line, and the exit code is zero

#### Scenario: Sync refusal on stderr
- **WHEN** `osq sync <id>` runs with `vcs.enabled` off
- **THEN** stdout is empty, stderr holds `osq sync needs vcs.enabled and git`, and the exit code is one

#### Scenario: Sync is registered
- **WHEN** `osq --help` runs
- **THEN** it lists `sync <id>`

### Requirement: Command errors
`src/cli/command-error.ts` SHALL export `CommandError`, an `Error` named
`CommandError` with a readonly `exitCode`, default 1, and a readonly `next`
step or `undefined`. No file under `src/cli/` SHALL call `process.exit`, no
file under `src/cli/` other than `run.ts` SHALL set `process.exitCode`, and no
command SHALL take an `exit` option. Where a command fails, it SHALL throw a
`CommandError` with the exit code it fails with. When it printed a plain error
line to stderr, the message SHALL be exactly that line; when it printed its
failure through the logger or as a report, or printed none, the message SHALL
be empty and the command SHALL keep printing as before. The command SHALL NOT
print the message or the next step itself.

#### Scenario: Caller carries on
- **WHEN** a caller awaits `showCommand('999')` in a project without change 999
- **THEN** it rejects with a `CommandError` whose message is `Show error: Spec "999" not found in specs or archive` and whose exit code is 1, nothing is printed, and the caller keeps running

#### Scenario: Several ids stop at the first failure
- **WHEN** `osq approve A B` runs and approving A fails
- **THEN** the command fails with A's error and B is not approved

#### Scenario: No command ends the process
- **WHEN** every file under `src/cli/` is read
- **THEN** none contains `process.exit(`

#### Scenario: No command sets the exit code
- **WHEN** every file under `src/cli/` other than `run.ts` is read
- **THEN** none assigns `process.exitCode`, and none declares an `exit` option

#### Scenario: Failing lint leaves the caller running
- **WHEN** a caller awaits `lintCommand` on a change with an error finding
- **THEN** the findings print as before, it rejects with a `CommandError` with an empty message and exit code 1, and `process.exitCode` is unchanged

#### Scenario: Land refusal
- **WHEN** a caller awaits `landCommand` for an id with no archived change
- **THEN** it rejects with a `CommandError` whose message is the refusal line `osq land` printed to stderr before, and nothing is printed

#### Scenario: Planner exit code
- **WHEN** the planner session `planCommand` launched exits 3
- **THEN** `planCommand` rejects with a `CommandError` with an empty message and exit code 3, and `osq plan` exits 3

### Requirement: Traceability opt-in check
`src/core/foundation/config-traceability.ts` SHALL export
`isCapabilityOptedIn(capabilities, capability)`, true when `capabilities` is
`'all'` or lists `capability`, and `hasOptedInCapability(capabilities)`, true
when `capabilities` is `'all'` or a non-empty list. The mutation pick, the
focused test collection, the watcher's mutation check, and the report's
mutation scores SHALL use them and define none of their own.

#### Scenario: Opt-in answers
- **WHEN** `isCapabilityOptedIn` is asked about `pricing`, and `hasOptedInCapability` is called, for each `capabilities` value
- **THEN** they return:

| capabilities | isCapabilityOptedIn pricing | hasOptedInCapability |
| --- | --- | --- |
| `'all'` | true | true |
| `['pricing', 'billing']` | true | true |
| `['billing']` | false | true |
| `[]` | false | false |

#### Scenario: One opt-in definition
- **WHEN** the sources of `src/core/trace/mutation-pick.ts`, `src/core/run/focused-tests.ts`, `src/watcher/mutation-check.ts`, and `src/core/report/report-mutation.ts` are read
- **THEN** none compares `capabilities` with `'all'` itself or defines `isOptedIn` or `hasOptedInCapability`, and each imports from `src/core/foundation/config-traceability.ts`

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

### Requirement: Lint repository flag
`osq lint [ids...]` SHALL accept `--repository`, described as `list every
repository finding`, and pass it to `lintCommand` as `repository: true`.
Without it, `lintCommand` SHALL print the repository count line that
"Repository lint output" describes.

#### Scenario: Flag listed
- **WHEN** `osq lint --help` runs
- **THEN** it lists `--repository`

#### Scenario: Flag reaches the command
- **WHEN** `osq lint 001 --repository` runs through `createProgram` next to a living spec with one long requirement
- **THEN** it prints the repository header line and one line starting `repository: warning `

### Requirement: Marker output limits
`limits` SHALL carry `markerOutputLines`, default 40, the most output lines a
`.run/` marker keeps when the output has no `✖ failing tests:` section and
the most lines an event's output tail keeps, and `markerLineChars`, default
400, the most characters a marker or an event's output tail keeps of any one
output line. Both SHALL merge from `osq.config.ts` like the other limits.

#### Scenario: Default marker limits
- **WHEN** `DEFAULT_CONFIG.limits` is inspected
- **THEN** `markerOutputLines` is 40 and `markerLineChars` is 400

#### Scenario: Configured marker lines
- **WHEN** `osq.config.ts` sets `limits.markerOutputLines` to 5 and archive-time verification fails with 100 lines of output and no failing-tests section
- **THEN** `.run/regressed/change.md` holds the last 5 output lines and the `Full output:` line

### Requirement: Spec command
`osq spec [capability] [requirement]`, registered by `registerSpecCommand` in
`src/cli/spec.ts`, SHALL print what "Living requirement lookup" returns: one
capability name per line with no argument, one requirement name per line with a
capability, and the requirement's block and a newline with both. A failed
lookup SHALL throw a `CommandError` with the lookup's message, so `runCli`
prints it to stderr and exits 1.

#### Scenario: Command listed
- **WHEN** `createProgram()` is inspected
- **THEN** it has a `spec` command with optional `capability` and `requirement` arguments, described as `list living capabilities and their requirements, or print one requirement`

#### Scenario: Requirement printed
- **WHEN** `specCommand('alpha', 'First rule')` runs in a project whose `alpha` spec has that requirement
- **THEN** stdout receives the requirement's block followed by one newline

#### Scenario: Names printed one per line
- **WHEN** `specCommand('alpha')` runs in a project whose `alpha` spec holds "Second rule" and "First rule"
- **THEN** stdout receives `Second rule\nFirst rule\n`

#### Scenario: Unknown capability fails
- **WHEN** `specCommand('missing')` runs in a project whose only living capability is `alpha`
- **THEN** it rejects with a `CommandError` whose message is `No living capability "missing". Capabilities: alpha` and whose exit code is 1, and stdout receives nothing

### Requirement: Spec command documentation
README's command list SHALL name `osq spec`, and README's description of what
an executor reads SHALL say it reads the requirements its task names through
`osq spec`, not whole capability specs.

#### Scenario: README names the command
- **WHEN** `README.md` is inspected
- **THEN** its command list has a line starting `osq spec`, and it no longer says an agent reads "the delta specs and capability docs it names"

### Requirement: Executor requirement reading
Executor step 1 in `EXECUTOR_STEPS` SHALL read exactly: `1. Read your task
file, its parent proposal.md, and the delta specs it names. From living
capability specs, read only the requirements the task or proposal names; osq
spec <capability> <requirement> prints one. Nothing else.`, with `proposal.md`
and `osq spec <capability> <requirement>` in backticks. The repository's
`AGENTS.md` and `.opencode/agent/osq-coder.md` SHALL carry the same block.

#### Scenario: Executor asks for named requirements
- **WHEN** `EXECUTOR_STEPS`, `MANAGED_AGENTS_MD_BODY`, and a prompt from `buildExecutorPrompt` are inspected
- **THEN** each holds the new step 1 and none holds `then only the delta specs and capability specs it names`

#### Scenario: Executor copies current
- **WHEN** `AGENTS.md` and `.opencode/agent/osq-coder.md` are inspected
- **THEN** each managed block holds the new executor step 1

### Requirement: Planner requirement reading
Step 1 of the managed planner block's `### Interactive planning` SHALL read exactly:

```
1. Read `AGENTS.md`, the requirements this change touches, and one recent
   archived change end to end. `osq spec <capability>` lists a living spec's
   requirements and `osq spec <capability> <requirement>` prints one; read
   those, not whole capability specs.
```

The repository's `PLANNER.md` and `templates/PLANNER.md` SHALL carry the same block.

#### Scenario: Planner asks for requirements
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it holds the new step 1 and doesn't hold `the capability specs this change touches`

#### Scenario: Planner copies current
- **WHEN** `PLANNER.md` and `templates/PLANNER.md` are inspected
- **THEN** each managed block holds the new planner step 1

### Requirement: Confinement configuration
`osq.config.ts` MAY set `confinement`, an object whose only key is `roles`.
`roles` MAY set `prepare`, `agent`, and `verify`, each an object whose only
key is `env`, a list of environment variable names. The resolved config SHALL
always hold `confinement.roles` with all three roles, and a role the config
leaves out SHALL default to `{ env: [] }`. Validation SHALL fail with:

- `confinement must be an object` when `confinement` is not an object
- `confinement.<key> is not supported` for any key other than `roles`
- `confinement.roles must be an object` when `roles` is not an object
- `confinement.roles.<key> is not a role; use prepare, agent, or verify` for
  any other role key
- `confinement.roles.<role>.<key> is not supported` for any key other than
  `env`
- `confinement.roles.<role>.env must be a list of environment variable names`
  when `env` is not an array of strings each matching
  `^[A-Za-z_][A-Za-z0-9_]*$`

The block lives in `src/core/foundation/config-confinement.ts`, which exports
the `ConfinementRole` type, `CONFINEMENT_ROLES`, `ConfinementConfig`,
`DEFAULT_CONFINEMENT_CONFIG`, and `validateConfinementConfig`.
`OsqUserConfig` SHALL accept a partial `confinement` block.

#### Scenario: Default
- **WHEN** a project's config sets no `confinement`
- **THEN** the resolved `confinement.roles` is `{ prepare: { env: [] }, agent: { env: [] }, verify: { env: [] } }`

#### Scenario: One role
- **WHEN** it sets `confinement: { roles: { verify: { env: ['DATABASE_URL'] } } }`
- **THEN** the resolved verify role's `env` is `['DATABASE_URL']`, and prepare's and agent's are empty

#### Scenario: Unknown role
- **WHEN** it sets `confinement: { roles: { planner: { env: [] } } }`
- **THEN** defining the config fails with `confinement.roles.planner is not a role; use prepare, agent, or verify`

#### Scenario: Flat key
- **WHEN** it sets `confinement: { verifyEnv: ['X'] }`
- **THEN** defining the config fails with `confinement.verifyEnv is not supported`

#### Scenario: Bad name
- **WHEN** it sets `confinement: { roles: { verify: { env: ['NOT A NAME'] } } }`
- **THEN** defining the config fails with `confinement.roles.verify.env must be a list of environment variable names`

### Requirement: Harness agent environment names
Every harness catalog entry SHALL declare `agentEnv`, the environment
variable names its harness reads for its model provider and its own
configuration:

- `agy`: `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`
- `opencode`: `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `MISTRAL_API_KEY`
- `mock`: none
- `codex`: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CODEX_HOME`
- `pi`: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN`, `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL`, `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `XAI_API_KEY`, `FIREWORKS_API_KEY`, `TOGETHER_API_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, `ZAI_API_KEY`, `MISTRAL_API_KEY`, `MINIMAX_API_KEY`, `MOONSHOT_API_KEY`, `OPENCODE_API_KEY`, `KIMI_API_KEY`, `PI_CODING_AGENT_DIR`
- `claude`: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CONFIG_DIR`

A variable a harness needs beyond these, such as cloud credentials for a
hosted model, is listed by the project in `confinement.roles.agent.env`.

#### Scenario: Every entry declares names
- **WHEN** the catalog is read
- **THEN** every entry has an `agentEnv` array, `mock`'s is empty, and `claude`'s holds `ANTHROPIC_API_KEY`

### Requirement: Change numbers across trees
`src/core/foundation/change-number.ts` SHALL export `getNextSpecNumber`,
unchanged from `new.ts`, which still re-exports it, and
`knownChangeFolders(projectRoot, config)`. `knownChangeFolders` SHALL return
the folder name of every change `listChanges` returns, active, archived, and
rejected, and, with `vcs.enabled` and `GitVcs` selected, the name of every
branch `listBranches('osq/')` lists, without its `osq/` prefix and without a
trailing `-rejected-<n>`. `createNewSpec` SHALL take an optional `config`.
With it, the new change's number SHALL be one more than the highest numeric
prefix among the folders `getNextSpecNumber` scans and the folders
`knownChangeFolders` returns, zero-padded to three digits. Without it, the
number SHALL be what `getNextSpecNumber` returns. `osq new` SHALL load the
project's config and pass it, and `osq plan` SHALL pass the config it loaded,
for a queue item and for a named change alike.

#### Scenario: Running change keeps its number
- **WHEN** `vcs.enabled` is on, the checkout holds only archived `001-a` and `002-b`, and `003-c` runs in its worktree
- **THEN** `osq new next` creates `004-next`

#### Scenario: Stacked change keeps its number
- **WHEN** the checkout holds no `004-d` and the stacked approval directory holds `004-d`
- **THEN** the next change created is `005-<slug>`

#### Scenario: Rejected branch keeps its number
- **WHEN** no tree holds `006-f`, and branches `osq/006-f` and `osq/006-f-rejected-1` exist
- **THEN** the next change created is `007-<slug>`, and `knownChangeFolders` lists `006-f` for both branches

#### Scenario: Version control off
- **WHEN** `vcs.enabled` is off and the checkout holds active `001-a` and archived `002-b`
- **THEN** the next change created is `003-<slug>`, and no git command runs

### Requirement: Tests start no background git work
Every git process started during `pnpm test` SHALL run with
`maintenance.auto=false`, so no detached `git maintenance run --auto` is still
writing when a test removes its temp root. The preload `tests/git-test-env.ts`
adds the setting once, after any `GIT_CONFIG_*` entries already in
`process.env`. Both `node --test` invocations in the `test` script SHALL import
it. `tests/git-background-work.test.ts` SHALL enforce the rule.

#### Scenario: A test commits
- **WHEN** a test commits in its temp repository under the test run's environment
- **THEN** git's trace2 event log records no `git maintenance` child

#### Scenario: A commit outside the test environment
- **WHEN** the same commit runs with `maintenance.auto=true` and none of the preload's variables
- **THEN** git's trace2 event log records a `git maintenance run --auto` child

#### Scenario: Existing git configuration in the environment
- **WHEN** the environment already sets `GIT_CONFIG_COUNT=1` with one key and value
- **THEN** the preload keeps that entry, adds `maintenance.auto=false` as entry 1, and sets `GIT_CONFIG_COUNT=2`

#### Scenario: The preload runs twice
- **WHEN** the preload applies to an environment it already changed
- **THEN** the environment is unchanged

#### Scenario: A test script drops the preload
- **WHEN** a `node --test` invocation in the `test` script of `package.json` does not import `./tests/git-test-env.ts`
- **THEN** `tests/git-background-work.test.ts` fails, naming the invocation

### Requirement: Command error streams
`runCli` SHALL catch a `CommandError`, print a non-empty message to stderr,
then print `Next: <next>` to stdout when `next` is set, and set
`process.exitCode` to its `exitCode` without ending the process. Any error
that is neither a `CommandError` nor a `ConfigLoadError` SHALL propagate from
`runCli` as before. Every command SHALL print the same text on the same
streams, in the same order, and exit with the same code as before.

#### Scenario: Refusal on the command line
- **WHEN** `osq show 999` runs in a project without change 999
- **THEN** stderr holds exactly `Show error: Spec "999" not found in specs or archive`, stdout is empty, the exit code is 1, and `process.exit` is never called

### Requirement: No command records a verification
osq SHALL register no `check` and no `verified` command. A check osq can run
is a proposal's `check:` command, which the watcher runs at archive and
`osq land` runs in its sync. A step osq cannot run is an after-landing note,
and no command records that a human did it.

#### Scenario: Removed commands
- **WHEN** `createProgram` builds the CLI
- **THEN** it has no `check` and no `verified` command

### Requirement: No inert stand-ins
No `.ts` or `.tsx` file under `src/` or `tests/` SHALL consist only of
comments, blank lines, and `export {};`. A change that removes a module SHALL
delete its file. `tests/no-inert-modules.test.ts` SHALL enforce the rule and
name each file that breaks it.

#### Scenario: Stand-in left behind
- **WHEN** a file under `src/` holds only a comment and `export {};`
- **THEN** `tests/no-inert-modules.test.ts` fails naming that file

#### Scenario: Removed modules deleted
- **WHEN** the files 123 left as stand-ins are deleted
- **THEN** `tests/no-inert-modules.test.ts` passes

### Requirement: Planning a change that needs steering
`osq plan <id>` SHALL first look the change up with `findSteeringChange`,
which knows every tree and finds an archived change in a worktree that needs
steering. When the change's derived state has `steering`, as the
status-inspection requirement "Steering triggers" defines it, planning SHALL
reopen that change's own folder, wherever it is, and build the usual prompt
sections for it, then append a `## Steering` section. When an approved change
outside the checkout, in a worktree or a stacked approval, has no `steering`,
`osq plan <id>` SHALL fail with
`<folder> is approved and needs no steering; osq plan <id> reopens an approved change only when it needs steering`
and write nothing. A change in the checkout without `steering`, or one
`findSteeringChange` does not find, SHALL be planned exactly as before.

The `## Steering` section SHALL hold, in order: the line
`osq halted this change and asks you to revise its plan.`; for each trigger in
`deriveSteering` order, a `### <describeTrigger>` heading, the line
`Evidence: <absolute path of the trigger's marker>`, and the marker's body
without its frontmatter inside a fenced block. Under a `requirement_changed`
trigger, for each requirement `changedRequirements` reports between the
requirements base and the default branch's tip, it SHALL add a
`#### <capability>: <requirement> on <default branch>` heading and that
requirement's full text on the default branch inside a fenced block, or the
line `Removed on <default branch>.` when the default branch lacks it. Then come
these three lines, with
the tree root, folder path, done task numbers comma-separated or `none`, and
id filled in:

- `The change runs in <tree root>; read its code there. Edit only <folder path>.`
- `Done tasks stay done: <tasks>. Add a task for new work instead of rewriting a done one.`

When a trigger is a default-branch trigger, a fourth line SHALL follow the
first: `Approval restarts osq/<folder> from <default branch>, and every task
runs again.` when any trigger is `conflict`, and otherwise `Approval merges
<default branch> into osq/<folder> without running verify; add a task that
makes the merged tree pass.` After a `conflict` trigger, the done-tasks line
SHALL read `Every task runs again after the restart. Revise any task the
conflict shows is wrong.`
- ``Run `osq lint <id>` and fix every finding. A human runs `osq approve <id>`, and the run continues from the first task that is not done.``

The default handoff SHALL write `plan-prompt.md` into the change's own folder
and print its one line as before. `--print` SHALL print the same prompt.
`--session` SHALL start the planner with the change's tree root as its working
directory, and read planning usage from that directory.

#### Scenario: Plan a blocked change in its worktree
- **WHEN** task 2 of a change that runs in a worktree died with `blocked` and the stated need `Needs src/three.txt`, and a human runs `osq plan <id>` in the checkout
- **THEN** the worktree's change folder holds `plan-prompt.md` ending in the `## Steering` section with `### task 2 blocked (blocked)`, the dead marker's path, `Needs src/three.txt`, and `Done tasks stay done: 1.`, the checkout holds no copy of the change, and no new change folder was created

#### Scenario: Session in the worktree
- **WHEN** `osq plan <id> --session` runs for a change in a worktree that needs steering, with a fake interactive adapter
- **THEN** the adapter is started with the worktree root as `cwd` and a prompt that holds the `## Steering` section

#### Scenario: Approved change needs no steering
- **WHEN** a change runs in a worktree with a pending task and no trigger, and a human runs `osq plan <id>`
- **THEN** the command fails with `needs no steering` and no file changes in the worktree or the checkout

#### Scenario: Plan an archived change after a land conflict
- **WHEN** `osq land <id>` recorded a `sync_conflict` stop on `src/one.txt` for an archived change, and a human runs `osq plan <id>` in the checkout
- **THEN** the worktree's archive folder holds `plan-prompt.md` ending in the `## Steering` section with `### change conflict (sync_conflict)`, `src/one.txt`, `Approval restarts osq/<folder> from main, and every task runs again.`, and `Every task runs again after the restart.`, and no new change folder was created

#### Scenario: Changed requirement text in the prompt
- **WHEN** an active change in a worktree halted with `requirement_changed` on `orders: Order totals`, which the default branch rewrote to hold `rounded to cents`
- **THEN** its `## Steering` section holds `#### orders: Order totals on main` and a fenced block holding `rounded to cents`

### Requirement: Steering guidance
README.md SHALL describe steering in its `## Gates and permissions` section as
a `**Steering.**` bullet: the five triggers, naming the default-branch
triggers as a conflict, a changed requirement, or a red verify or check when
osq merges the default branch, at the watcher's sync or at `osq land`, which
records an archived change's stop on its branch, the one inbox item with its
trigger, reason, and `osq plan <id>`, the prompt written into the change's own
folder with each trigger's marker as evidence, `--session` starting the planner
there, the watcher leaving the change alone, and `osq approve <id>` sealing the
revised plan where the change runs, keeping done tasks, retiring each trigger
as `osq retry` does, and continuing from the first task that is not done.
The bullet SHALL also say that approval after a conflict restarts the branch
from the default branch, keeps the old branch, and runs every task again, and
that approval after the other default-branch triggers merges the default
branch without running verify and keeps done tasks. The `## Version control`
paragraph on syncing SHALL name the reasons `sync_conflict`,
`requirement_changed`, and `sync_verify_red`, and say each asks for steering
with `osq plan <id>`. The
loop diagram SHALL show the steering step. The README's paragraphs on stuck and
blocked tasks and its inbox section SHALL say that such a change needs steering
and name `osq plan <id>`, and SHALL keep saying that `osq retry <id> <n>`
still retries a stuck task and that the stuck field is optional. CHANGELOG.md's
Unreleased section SHALL say what changed for a stuck, blocked, or regressed
change, and for a change the default branch stops.

#### Scenario: README steering bullet
- **WHEN** README.md is read
- **THEN** its `## Gates and permissions` section holds a `**Steering.**` bullet naming `stuck`, `blocked`, `osq plan <id>`, `osq approve <id>`, and the first task that is not done

#### Scenario: README default-branch steering
- **WHEN** README.md is read
- **THEN** its `**Steering.**` bullet names `conflict`, `requirement_changed`, `sync_verify_red`, `osq land`, and a restart from the default branch, and its sync paragraph names `requirement_changed` and `sync_verify_red`

### Requirement: History lookup in managed blocks
The managed `PLANNER.md` block SHALL tell planners to look up osq's own
history with `osq query "<select>"`, that `osq query` alone lists its tables,
to add `LIMIT`, and not to open event files for it. The executor protocol's
"Where things live" section SHALL say the same for archived changes.

#### Scenario: Fresh init
- **WHEN** `osq init` writes the managed blocks into a new project
- **THEN** `PLANNER.md` and the executor protocol in `AGENTS.md` each name `osq query` and `LIMIT`

### Requirement: Provider outage gate keys
Public configuration SHALL contain `gates.providerStallSeconds`, defaulting to
300, `gates.providerRetries`, defaulting to 3, and
`gates.providerRetryDelaySeconds`, defaulting to 300. Each SHALL be a
non-negative integer, a partial gates block SHALL keep each missing key's
default, and any other value SHALL be rejected with an error naming the key.

#### Scenario: Defaults
- **WHEN** configuration declares no `gates` block, or one without these keys
- **THEN** `gates.providerStallSeconds` is 300, `gates.providerRetries` is 3, and `gates.providerRetryDelaySeconds` is 300

#### Scenario: Invalid value
- **WHEN** `gates.providerRetries` is negative, fractional, or not a number
- **THEN** loading the configuration fails with `gates.providerRetries must be a non-negative integer`

### Requirement: Harness containment report
Every harness catalog entry SHALL declare `containment`, a function from
configuration to `{ ok, warning?, message }` that says what confines that
harness's agent. When the `config` check passes, doctor SHALL add one
`harness-containment` check for the selected harness from its catalog entry,
right after `harness` and any checks its `diagnose` hook adds, whether or not
the harness probe passed, and without naming any harness. The messages SHALL
be:

- `agy` with `agy.dangerouslySkipPermissions: true`: a passing warning,
  `agy.dangerouslySkipPermissions is true: agy approves every tool call, so nothing stops git, network tools, or sudo`.
- `agy` otherwise: a failure,
  `agy asks before every tool call and a headless task cannot answer; set agy.dangerouslySkipPermissions: true to accept that, or choose another harness`.
- `claude`: passing, as "Claude diagnostics" describes.
- `codex`: passing,
  `workspace-write sandbox: writes confined to the project, .git read-only, no network`.
- `opencode` with `opencode.agent` set to `osq-coder`: passing,
  `osq-coder agent denies git, curl, wget, ssh, scp, sudo, and web tools; shell unconfined with open network`.
- `opencode` with any other agent: a passing warning,
  `opencode.agent is <agent>, not osq-coder: that agent's own permissions apply, not osq's denials`.
- `pi`: passing,
  `nothing confines the agent: no permission prompts, no sandbox, open network`.
- `mock`: passing, `no agent process`.

#### Scenario: Codex containment
- **WHEN** doctor runs with harness `codex`
- **THEN** the check after `harness` is a passing `harness-containment` check naming the workspace-write sandbox

#### Scenario: agy without the bypass
- **WHEN** doctor runs with harness `agy` and `agy.dangerouslySkipPermissions` unset
- **THEN** the `harness-containment` check fails naming `agy.dangerouslySkipPermissions`, and doctor exits 1

#### Scenario: agy with the bypass
- **WHEN** doctor runs with harness `agy` and `agy.dangerouslySkipPermissions: true`
- **THEN** the `harness-containment` check passes with a warning saying agy approves every tool call

#### Scenario: opencode with another agent
- **WHEN** doctor runs with harness `opencode` and `opencode.agent: 'build'`
- **THEN** the `harness-containment` check passes with a warning naming `build`

#### Scenario: Containment follows diagnoses
- **WHEN** doctor runs with harness `pi` and `pi.provider` set
- **THEN** the checks run `config`, `harness`, `harness-version`, `harness-auth`, `harness-containment`, then `managed-blocks`

### Requirement: Codex guidance
The README and scaffolded environment example SHALL describe Codex selection, independent planning configuration, optional model/effort, precedence, setup and authentication prerequisites, permissions, diagnostics, fresh sessions, watcher verification, and observed-only metrics. Codex selection in the scaffolded environment example SHALL stay commented. Examples SHALL contain no credentials or hard-coded recommended model.

#### Scenario: Scaffold preservation
- **WHEN** a clean project is scaffolded and later scaffolded again after its environment example is edited
- **THEN** the original generated example includes commented Codex guidance and the repeat run preserves consumer edits

#### Scenario: Honest support boundaries
- **WHEN** a consumer reads the Codex guidance
- **THEN** it distinguishes task scope from sandbox permissions, leaves unreported cost unestimated, and describes optional live validation without claiming an untested minimum CLI version

### Requirement: Scaffolded harness default
`osq init` SHALL write `harness: process.env.OSQ_HARNESS || 'pi'` in
`osq.config.ts`, and the scaffolded `.env.example` SHALL start with
`OSQ_HARNESS=pi`. The repository's `.env.example` and `templates/.env.example`
SHALL equal the scaffolded `.env.example` byte for byte.

#### Scenario: Pi is the scaffolded default
- **WHEN** `osq init` runs in an empty directory
- **THEN** `osq.config.ts` contains `harness: process.env.OSQ_HARNESS || 'pi'` and the first line of `.env.example` is `OSQ_HARNESS=pi`

#### Scenario: Scaffold copies match
- **WHEN** `osq init` runs in an empty directory
- **THEN** its `.env.example` equals the repository's `.env.example` and `templates/.env.example`

### Requirement: Command inputs
`src/cli/command-inputs.ts` SHALL export `Writer`, a function that receives
exactly the text a command prints, newlines included; `CommandInputs`, with
optional `cwd`, `config`, `stdout` and `stderr`; `processStdout` and
`processStderr`, the writers to the process streams; `resolveInputs`, which
fills `cwd` with `process.cwd()` and each missing writer with its process
writer, and gives `config()`, the passed config or `loadConfig(cwd)`; and
`commandLogger`, the `osq` logger at a level, writing to the process stderr
when no `stderr` is passed and to the passed `stderr` otherwise. Every
exported command function under `src/cli/` SHALL accept `CommandInputs` in
its options, with those names and meaning.

#### Scenario: Captured in-process
- **WHEN** a caller awaits `statusCommand({ cwd, config, stdout, stderr })`
- **THEN** `stdout` receives the text `osq status` prints in `cwd`, ending in a newline, and nothing reaches the process streams

#### Scenario: Same bytes by default
- **WHEN** `osq status`, `osq report` or `osq doctor` runs through `runCli`
- **THEN** stdout, stderr and the exit code are the same as when the command is called directly with writers that append to strings

### Requirement: Commands print through their inputs
A command SHALL print only through its `stdout` and `stderr`, or through a
logger from `commandLogger`, and SHALL pass its writers to every helper and
core seam that prints for it. When a caller passes none of the inputs, the
command SHALL print the same bytes, on the same streams, in the same order,
and exit with the same code as before. No file under `src/cli/` other than
`command-inputs.ts` SHALL call `console.*`, `process.stdout.write` or
`process.stderr.write`; `runCli` prints through `processStdout` and
`processStderr`.

#### Scenario: Logger output captured
- **WHEN** a caller awaits `lintCommand([id], { cwd, config, stderr })` on a change with an error finding
- **THEN** `stderr` receives the finding lines, and the command rejects with a `CommandError` with an empty message

#### Scenario: No direct output
- **WHEN** every file under `src/cli/` other than `command-inputs.ts` is read
- **THEN** none contains `console.`, `process.stdout.write` or `process.stderr.write`

### Requirement: Inbox card actions run in-process
`inboxDispatchCommand` SHALL take `isTerminal`, `input`, and `launch`
options, defaulting to both stdio streams being TTYs, the terminal input, and
`createActionLauncher` from `src/cli/inbox-actions.ts` built with the
command's `cwd`, loaded config, `stdout`, and `stderr`. When `isTerminal()`
is true and neither `json` nor `follow` is set, it SHALL run
`runCardSession` with the inbox sound built by `createInboxSound`.

`createTerminalInput(stream)` SHALL read one key at a time with raw mode on
while a key is awaited and off otherwise, and `line(question)` SHALL write
the question and read one line with raw mode off. A stream without
`setRawMode` SHALL still work. Each read SHALL resume the stream when it
starts, and when it ends remove its listeners and pause the stream, so
between reads the stream is paused, out of raw mode, and has no listener
of its own.

`createActionLauncher(inputs, actions?)` SHALL return a `Launcher` that runs
a card key's command in the same process, never through a child process,
calling the command function with `inputs` (`cwd`, `config`, `stdout`,
`stderr`):

- `approve <id>`: `approveCommand([id], inputs)`.
- `plan <id>`: `planCommand(id, inputs)`.
- `retry <id> <target>`: `retryCommand(id, target, inputs)`.
- `reject <id> --reason <text>`: `rejectCommand(id, { ...inputs, reason: text })`.
- `show <id>`: `showCommand(id, inputs)`.

It SHALL resolve 0 when the command resolves. When the command throws a
`CommandError`, it SHALL write the message and `\n` to `stderr` when the
message is not empty, then `Next: <next>\n` to `stdout` when `next` is set,
and resolve with the error's `exitCode`. Any other thrown value SHALL write
`Error: <message>\n` to `stderr` and resolve 1. Arguments that match no
entry, by verb or by count, SHALL write
`osq inbox: no action for <arguments joined by spaces>\n` to `stderr` and
resolve 1 without calling a command. The launcher SHALL never set
`process.exitCode`, end the process, or reject. `actions` SHALL default to
the table above; a test may pass its own table of the same shape.

README.md SHALL say, in the Human Attention Inbox section, that
`osq inbox` on a terminal opens cards, list the keys `a` approve, `p` plan,
`r` retry, `x` reject, `s` show, `n` skip, and `q` quit, say that a key runs
the osq command inside the same `osq inbox` process on the same terminal and
prints its error and next step when it fails, that the land command is shown
to copy, and that piping or `--json` prints as before. It SHALL not say that
a key starts a child process.

#### Scenario: Terminal runs the session
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` true, scripted keys `q`, and a project with one approval item
- **THEN** the approval card with its `Keys:` block prints and the command resolves without launching

#### Scenario: No terminal prints
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` false
- **THEN** it prints what `osq inbox` printed before

#### Scenario: Raw mode around a key
- **WHEN** `createTerminalInput` reads a key from a fake stream with `setRawMode`
- **THEN** raw mode is turned on before the read and off after it

#### Scenario: Show in the same process
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` true, the default launcher, scripted keys `s` then `q`, and a project with one approval item for change 001
- **THEN** stdout holds `── osq show 001 ──`, then `osq show`'s `Spec: 001-` line, then `── exit 0 ──`

#### Scenario: Failed approve carries on
- **WHEN** the same session gets keys `a` then `q`, and approving change 001 fails
- **THEN** stderr starts with `Error approving 001:`, stdout holds a `Next: ` line before `── exit 1 ──` and then the approval card again, and `process.exitCode` is what it was before

#### Scenario: Each verb reaches its command
- **WHEN** the default launcher runs `retry 999 1`, `reject 999 --reason r`, and `show 999` in a project with no change 999, and `plan 001` for a change with a brief
- **THEN** stderr starts with `Error retrying 999 1:`, `Error rejecting 999:`, and `Show error:` and each resolves 1, and `plan 001` prints the prompt handoff line and resolves 0

#### Scenario: Failures without a command error
- **WHEN** a launcher built with a test table runs an action that throws `new Error('boom')`, one that throws a `CommandError` with an empty message and exit code 3, and the arguments `land 001`
- **THEN** they resolve 1 with `Error: boom\n` on stderr, 3 with nothing on stderr, and 1 with `osq inbox: no action for land 001\n` on stderr without calling any action

#### Scenario: Terminal between reads
- **WHEN** `inboxDispatchCommand` runs with `createTerminalInput` over a fake stream holding `sq` and a recording launcher
- **THEN** while the launcher runs, the stream is paused, has no `data` listener, and the last raw mode set was off

### Requirement: Grouped root help
`osq --help` SHALL print, after the description, the line `Run osq with no
command first: it shows what needs you.`, then the options, then the commands
in four groups in this order, each headed `<title> commands:`:

- Everyday: `inbox`, `plan`, `approve`, `land`, `retry`, `reject`
- Setup and running: `init`, `setup`, `watch`
- Inspection: `status`, `show`, `report`, `digest`, `query`, `spec`, `graph`, `serve`, `doctor`
- Plumbing: `new`, `lint`, `queue`, `sync`, `message`, `migrate`

Each row SHALL keep commander's term and description.

#### Scenario: Root help groups
- **WHEN** a user runs `osq --help`
- **THEN** the output holds the bare-`osq` line, then `Everyday commands:` listing `inbox`, `plan`, `approve`, `land`, `retry` and `reject` in that order, then the other three groups in order, and no `Commands:` or `Other commands:` heading

### Requirement: Help groups cover every command
`COMMAND_GROUPS` in `src/cli/help-groups.ts` SHALL hold the groups, and
`configureGroupedHelp` there SHALL install the root help in `createProgram`.
Every registered command SHALL appear exactly once in the root help. A
registered command no group names SHALL print under `Other commands:`, and
`COMMAND_GROUPS` SHALL name every registered command, so that heading never
prints; a new command SHALL be added to a group. A subcommand's `--help` SHALL
print commander's default help, unchanged.

#### Scenario: Every command once
- **WHEN** the root help is printed for the program `createProgram` builds
- **THEN** each of its registered commands starts exactly one row, and `COMMAND_GROUPS` names exactly the registered commands

#### Scenario: Subcommand help unchanged
- **WHEN** a user runs `osq land --help`
- **THEN** the output is commander's default help for `land`, with no group heading and no bare-`osq` line

### Requirement: README command groups
README's `## Commands` section SHALL list the commands in the root help's
groups and order, each group a bold label of its title followed by one fenced
block whose lines start with `osq`. The Everyday block SHALL start with the
bare `osq` and `osq --json` lines. Every command in a group SHALL have at
least one line in that group's block.

#### Scenario: README follows the help
- **WHEN** README's `## Commands` section is read
- **THEN** it holds the four labels in order, and each command `COMMAND_GROUPS` names has a line `osq <command>` in its own group's block

### Requirement: Dashboard command and configuration
The CLI SHALL provide `osq serve [--port <n>] [--open]`. It SHALL bind a Node
`http` server only to `127.0.0.1`, print the actual listening URL, optionally
launch that URL in the platform default browser after listening, and close its
HTTP and filesystem-watch resources on SIGINT or SIGTERM. It SHALL never start
the execution watcher. It SHALL write a project, cursor, change, or marker
file only by running an action a request to `/api/actions/<id>` asked for,
through `createWebActionRunner`.

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

### Requirement: Dashboard actions run in-process
`serveCommand` SHALL pass `startWebServer` a `runAction` built by
`createWebActionRunner({ cwd, config }, commands?)` from
`src/cli/serve-actions.ts`, with the command's `cwd` and loaded config. The
runner SHALL call, in the same process and never through a child process, the
command function for the request's verb, with `cwd`, `config`, and a
`stdout` and `stderr` writer that each collect that request's text:

- `approve`: `approveCommand([change], inputs)`.
- `land`: `landCommand(change, inputs)`.
- `reject`: `rejectCommand(change, { ...inputs, reason })`.
- `retry`: `retryCommand(change, target, inputs)`.

It SHALL resolve a `WebActionResult` with exit code 0 and `error` null when
the command resolves. When the command throws a `CommandError`, the result
SHALL carry its `exitCode` and `error` with its message and its `next` or
null. Any other thrown value SHALL give exit code 1 and `error` with message
`Error: <message>` and next null. The result SHALL always carry the collected
stdout and stderr. The runner SHALL never reject, set `process.exitCode`,
end the process, or write to a process stream. `commands` SHALL default to
the table above; a test may pass its own table of the same shape.

An action run this way SHALL write exactly the files and events the same
CLI command writes, so `osq show` and `osq report` read a browser action as
they read the command.

#### Scenario: Each verb reaches its command
- **WHEN** a runner built with a recording table runs `approve`, `land`, `reject` with reason `r`, and `retry` with target `2` for change `001`
- **THEN** each table entry is called once with change `001`, its reason or target, and the runner's `cwd` and config

#### Scenario: Failure carries the error and next step
- **WHEN** a command throws a `CommandError` with message `Error approving 001:`, exit code 1, and next `osq lint 001`, and another throws `new Error('boom')`
- **THEN** the results are exit code 1 with that message and next, and exit code 1 with `Error: boom` and next null

#### Scenario: Browser approve records like the CLI
- **WHEN** one ready change is approved through `osq serve`'s `POST /api/actions/<id>` and a twin project's change through `approveCommand`
- **THEN** both changes have `.run/approved` and the same sequence of event types

### Requirement: Validator configuration
`osq.config.ts` MAY hold a `validator` block with `enabled`, `harness`,
`model`, and `timeoutSeconds`. `validateValidatorConfig` in
`src/core/foundation/config-validator.ts` SHALL resolve it. `enabled` is a
boolean that defaults to true. `timeoutSeconds` is a positive number that
defaults to `DEFAULT_VALIDATOR_TIMEOUT_SECONDS`, 900. `harness` and `model`
are trimmed strings. While enabled, `harness` SHALL be a name in the harness
catalog and `model` SHALL be non-empty. The model SHALL never fall back to the
executor's model or to `OSQ_MODEL`. While disabled, a missing `harness` or
`model` resolves to an empty string, and a given one is checked as when
enabled. The resolved config SHALL leave `validator` out when the block is
unset. `defineConfig` SHALL throw `validator must be an object`,
`validator.<key> is not supported`, `validator.enabled must be a boolean`,
`validator.harness must be one of: <catalog names joined by ", ">`,
`validator.model must be a non-empty string`, or
`validator.timeoutSeconds must be a positive number` for any other value.

`validatorRunConfig(config, validator)` SHALL return the config the
validator's adapter runs with: `harness` set to the validator's harness and,
when that harness's catalog entry has a `configKey`, that section's `model`
set to the validator's model. Every other field SHALL be unchanged.

#### Scenario: Validator unset
- **WHEN** `defineConfig` gets no `validator` block
- **THEN** the resolved config has no `validator` key

#### Scenario: Validator defaults
- **WHEN** `defineConfig` gets `validator: { harness: 'claude', model: 'claude-opus-5-5' }`
- **THEN** the resolved `validator` is `{ enabled: true, harness: 'claude', model: 'claude-opus-5-5', timeoutSeconds: 900 }`

#### Scenario: Model never borrowed
- **WHEN** `defineConfig` gets `harness: 'claude'`, `claude: { model: 'claude-sonnet-5-5' }`, and `validator: { harness: 'claude' }`
- **THEN** it throws `validator.model must be a non-empty string`

#### Scenario: Validator off
- **WHEN** `defineConfig` gets `validator: { enabled: false }`
- **THEN** the resolved `validator` is `{ enabled: false, harness: '', model: '', timeoutSeconds: 900 }`

#### Scenario: Unknown validator harness
- **WHEN** `defineConfig` gets `validator: { harness: 'nope', model: 'm' }`
- **THEN** it throws `validator.harness must be one of: ` followed by the catalog names

#### Scenario: Run config
- **WHEN** `validatorRunConfig` gets a config with harness `pi` and `pi.model` `deepseek-flash`, and the validator `claude` with model `claude-opus-5-5`
- **THEN** the result has harness `claude` and `claude.model` `claude-opus-5-5`, and its `pi.model` is still `deepseek-flash`

### Requirement: Validator model doctor check
When the resolved config's `validator` is enabled, `osq doctor` SHALL add a
`validator-model` check after every other check. It passes with the message
`validator <harness>/<model>, executor <harness>/<model>`, where the
executor's harness and model are those `resolveExecutorIdentity` returns.
When the validator's harness and model both equal the executor's, the check
SHALL be a warning with the message
`validator uses the executor's harness and model (<harness>/<model>); its findings share the executor's blind spots`.
A missing or disabled validator SHALL add no check.

#### Scenario: Same model warns
- **WHEN** the config's harness is `claude` with `claude.model` `claude-opus-5-5` and the validator is `claude` with `claude-opus-5-5`
- **THEN** `osq doctor` prints `[warn] validator-model: validator uses the executor's harness and model (claude/claude-opus-5-5); its findings share the executor's blind spots` and its exit code is unchanged

#### Scenario: Different model passes
- **WHEN** the config's harness is `pi` with `pi.model` `deepseek-flash` and the validator is `claude` with `claude-opus-5-5`
- **THEN** the `validator-model` check passes with `validator claude/claude-opus-5-5, executor pi/deepseek-flash`

#### Scenario: No validator, no check
- **WHEN** the config has no `validator` block, or one with `enabled: false`
- **THEN** the doctor report has no `validator-model` check

### Requirement: Validator scaffold
`osq init` SHALL write the `validator` block in `osq.config.ts` commented
out, right after `maxConcurrency: 1,`, as these four lines:

```
  // A validator judges each change against its delta specs at archive and
  // records what it finds without stopping the change. Pick a model other
  // than the executor's.
  // validator: { harness: 'claude', model: '<a-different-model>' },
```

#### Scenario: Scaffolded validator is a comment
- **WHEN** `osq init` runs in an empty directory and `loadConfig` reads the result
- **THEN** `osq.config.ts` holds `  // validator: { harness: 'claude', model: '<a-different-model>' },` and the loaded config has no `validator` key

### Requirement: osq validates its own changes
osq's own `osq.config.ts` SHALL set
`validator: { harness: 'claude', model: 'claude-opus-5-5' }`, the model that
plans osq's changes, so a model other than the `pi` executor's judges them.
README SHALL describe the validator in a `### Validator` section after
`### Mutation checks`: the config block, when it runs, what it is given, the
three problems a finding names, the `validator_ran` outcomes, the `osq show`
and `osq report` sections, the `validator-model` doctor warning, and that it
never stops a change (ADR 010).

#### Scenario: Own validator
- **WHEN** `loadConfig` reads osq's own repository
- **THEN** its `validator` is `{ enabled: true, harness: 'claude', model: 'claude-opus-5-5', timeoutSeconds: 900 }`

#### Scenario: README section
- **WHEN** README is read
- **THEN** it has a `### Validator` heading after `### Mutation checks` and before `## What the watcher guarantees`, and that section names `validator_ran` and `validator-model`

### Requirement: Decisions scaffold
`osq init` SHALL write `<paths.decisions>/README.md` from
`templates/decisions/README.md` when that file is missing. It SHALL write
`<paths.decisions>/000-how-this-project-is-built.md` from
`templates/decisions/000-how-this-project-is-built.md` only when the decisions
folder is missing or holds no markdown file other than `README.md`. An existing
file SHALL never be overwritten, `--refresh-schema` included, and SHALL be
reported as existing like the other scaffolded files.

The README SHALL describe the ADR frontmatter osq reads: `status`,
`applies_to`, `rule`, `superseded_by`, `checks`, and `denies`, that only
accepted ADRs take effect, and that the number comes from the file name. The
starter SHALL have frontmatter `status: proposed` and `applies_to: all` and
no `rule`, the heading `# 000. How this project is built`, and one `## `
section per question, in this order: `Layering` (which layers exist, what
each may import, and where logic lives), `State` (where state lives and who
writes it), `Errors` (how errors are raised, reported, and recovered), `Tests`
(what a test looks like and what it may touch), and `Naming` (how files,
modules, and functions are named). A closing section SHALL say to turn each
answer that is a rule into an accepted ADR with `applies_to: all`, a
one-sentence `rule`, and `checks` naming a test wherever the rule can be
tested. The starter SHALL prescribe no answer.

#### Scenario: Fresh project
- **WHEN** `osq init` runs in an empty directory
- **THEN** `decisions/README.md` and `decisions/000-how-this-project-is-built.md` exist, both are in `createdFiles`, and `readDecisions` reads ADR `000` with status `proposed`

#### Scenario: Re-run keeps edits
- **WHEN** the starter has been edited and `osq init --refresh-schema` runs again
- **THEN** the starter keeps its edited bytes and is reported as existing

#### Scenario: Project with ADRs
- **WHEN** `osq init` runs in a project whose decisions folder holds `001-x.md` and no README
- **THEN** it writes `decisions/README.md` and no starter

### Requirement: Planner architecture-first guidance
The managed `PLANNER.md` block SHALL say, under `### Either way`, that a
project with no accepted ADR that applies to all writes its architecture and
style ADRs first, each with a one-sentence rule and a checks test where the
rule can be tested.

#### Scenario: Planner block names the order
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it holds `writes its architecture` and `and style ADRs first`

### Requirement: Architecture-first documentation
README's `## Install` block SHALL show, after `init`, writing the architecture
and style ADRs, starting from `decisions/000-how-this-project-is-built.md`,
before the first feature brief. The `decisions/` line in
`## What it puts in your repo` SHALL be marked as written by `osq init`. The
`### Architecture decisions` section SHALL say that decisions lint applies
once the project has an accepted ADR, and that `osq doctor` warns until an
accepted ADR applies to `all`.

#### Scenario: README order
- **WHEN** README is read
- **THEN** `## Install` names `decisions/000-how-this-project-is-built.md` after `init`, and `### Architecture decisions` says lint applies once an ADR is accepted

### Requirement: Commit catch-up gate key
Public configuration SHALL contain `gates.commitRetries`, defaulting to 2: the
catch-ups the watcher tries after a `commit_failed` halt before a human must
run `osq retry <id> change`. It SHALL be a non-negative integer, `0` turns the
catch-up after a halt off, a partial gates block SHALL keep its default, and
any other value SHALL be rejected with `gates.commitRetries must be a
non-negative integer`. A config whose `gates` object lacks the key, such as
one built in a test, SHALL behave as the default.

#### Scenario: Default
- **WHEN** configuration declares no `gates` block, or one without `commitRetries`
- **THEN** `gates.commitRetries` is 2

#### Scenario: Invalid value
- **WHEN** `gates.commitRetries` is negative, fractional, or not a number
- **THEN** loading the configuration fails with `gates.commitRetries must be a non-negative integer`

### Requirement: osq traces its own traceability capability
osq's own `osq.config.ts` SHALL set `traceability` to
`capabilities: ['traceability']`, `mode: 'warn'`, `focusedTests:
'node --import tsx --import ./tests/git-test-env.ts --test --test-reporter=tap {files}'`,
and `mutation: { command: 'npx stryker run', budgetSeconds: 300 }`. ADR 011
governs the trial. `tsconfig.json` SHALL map `@matteeh/osq/testing` to
`./src/testing/index.ts` under `compilerOptions.paths`, so a test imports the
helper by its package name with no build. AGENTS.md and PLANNER.md SHALL
carry the traceability blocks `osq init` writes for this config.

#### Scenario: Own traceability config
- **WHEN** `loadConfig` reads osq's own repository
- **THEN** its `traceability` is `traceability` in `warn` mode, with the tsx focused command and `npx stryker run` under a 300-second budget

#### Scenario: Helper by package name
- **WHEN** a test under `tests/` imports `scenario` from `@matteeh/osq/testing` and from `../src/testing/index.js`
- **THEN** both are the same function

#### Scenario: Report lists the capability
- **WHEN** `collectTraceabilityGaps` runs on osq's own repository with its own config
- **THEN** it returns one entry, for `traceability`

### Requirement: osq's own mutation setup
osq's repository SHALL hold `@stryker-mutator/core` 10.0.0 as an exact dev
dependency and a root `stryker.config.mjs`. Its `mutate` SHALL be
`OSQ_MUTATE` parsed as JSON, its command runner SHALL run
`node --import tsx --import ./tests/git-test-env.ts --test` with each
`OSQ_MUTATION_TESTS` entry single-quoted, and its JSON report SHALL go to
`OSQ_MUTATION_REPORT`. Its `tempDirName` SHALL be `stryker` in the folder of
`OSQ_MUTATION_REPORT`, or `osq-stryker` in the OS temp folder without it, so
a sandbox is never inside the tree the import graph reads.

#### Scenario: Mutation sandbox beside the report
- **WHEN** `stryker.config.mjs` loads with `OSQ_MUTATE` `["src/a.ts:1-3"]`, `OSQ_MUTATION_TESTS` `["tests/a.test.ts"]`, and `OSQ_MUTATION_REPORT` `/tmp/x/mutation.json`
- **THEN** `mutate` is `["src/a.ts:1-3"]`, the command ends with `--test 'tests/a.test.ts'`, `jsonReporter.fileName` is `/tmp/x/mutation.json`, and `tempDirName` is `/tmp/x/stryker`

### Requirement: Watch service configuration
`defineConfig` SHALL validate an optional `watch` block over these defaults
and put the result on `OsqConfig.watch`:

- `restartDelaySeconds`: 5. The first delay before restarting a crashed watcher.
- `restartMaxDelaySeconds`: 300. The longest restart delay, and the run time after which the delay starts over.
- `buildSettleSeconds`: 10. How old the newest `dist/` file must be before a service worker restarts on it.
- `stopWaitSeconds`: 15. How long `osq watch --stop` waits for the service to exit.
- `logMaxBytes`: 10485760. The size at which `watch.log` is rotated.

Each value SHALL be a finite number greater than zero. A partial block SHALL
keep each missing value's default. Any other value SHALL throw an error that
names the key, such as `watch.restartDelaySeconds must be a finite number
greater than zero`. `src/index.ts` SHALL export the `WatchConfig` type.

#### Scenario: Defaults
- **WHEN** `defineConfig({})` runs
- **THEN** `watch` is `{ restartDelaySeconds: 5, restartMaxDelaySeconds: 300, buildSettleSeconds: 10, stopWaitSeconds: 15, logMaxBytes: 10485760 }`

#### Scenario: Partial block
- **WHEN** `defineConfig({ watch: { buildSettleSeconds: 3 } })` runs
- **THEN** `watch.buildSettleSeconds` is 3 and the other four values are the defaults

#### Scenario: Invalid value
- **WHEN** `watch.restartDelaySeconds` is 0, -1, `Infinity`, or `'5'`
- **THEN** `defineConfig` throws an error naming `watch.restartDelaySeconds`

### Requirement: Background watch commands
`osq watch --background` SHALL start the watch service for the project and
return: it spawns the same Node executable with its `execArgv`, the `osq`
entry it runs from, and `watch` with `--verbose` or `--quiet` when given, as a
detached process with `OSQ_WATCH_ROLE=supervisor`, its stdout and stderr
appended to `watch.log`, writes `service.json`, and prints `osq watch is
running in the background (pid <pid>). Log: <log path>`. `osq watch
--background` with `--once`, `--dev` or `--allow-stale` SHALL fail with
`--background cannot be combined with --once, --dev or --allow-stale`.

`osq watch` with `OSQ_WATCH_ROLE=supervisor` SHALL run
`runServiceSupervisor`, and with `OSQ_WATCH_ROLE=worker` SHALL start the
watcher with `createServiceBuildCheck` as its `buildCheck` and write its
`watcher.json` with mode `background`. A continuous `osq watch` without a
role SHALL write `watcher.json` with mode `terminal`. Each SHALL remove its
own `watcher.json` when it exits. `osq watch --once` SHALL write no record.

`osq watch`, with or without `--background` or `--once`, SHALL fail before it
starts anything when `readWatchState` returns a live record:

| Live record | Message |
|---|---|
| `service.json` | `osq watch is already running in the background (pid <pid>). Log: <log path>. Stop it with osq watch --stop` |
| `watcher.json` only | `osq watch is already running in a terminal (pid <pid>)` |

A supervisor and its own worker are exempt from this check.

`osq watch --stop` SHALL send SIGTERM to the live supervisor and wait up to
`watch.stopWaitSeconds` for it to exit. It SHALL print `osq watch stopped
(pid <pid>)` when it exited, `osq watch is stopping after its running task
(pid <pid>)` when it did not, and `osq watch is not running in the
background` when `service.json` has no live record, exiting 0 in each case.
`--stop` with any other `watch` option SHALL fail with `--stop takes no other
option`.

#### Scenario: Start
- **WHEN** `osq watch --background` runs in a project with no live record
- **THEN** it prints `osq watch is running in the background (pid <pid>). Log: <log path>`, returns while the supervisor keeps running, and `service.json` names that pid

#### Scenario: Already running
- **WHEN** `osq watch --background` or `osq watch` runs while `service.json` names a live pid
- **THEN** it fails with the background message from the table and spawns nothing

#### Scenario: Terminal watcher running
- **WHEN** `osq watch --background` runs while only `watcher.json` names a live pid
- **THEN** it fails with `osq watch is already running in a terminal (pid <pid>)`

#### Scenario: Stop
- **WHEN** `osq watch --stop` runs while the service runs and its worker is idle
- **THEN** it prints `osq watch stopped (pid <pid>)`, and neither `service.json` nor `watcher.json` names a live pid

#### Scenario: Stop waits for the running task
- **WHEN** the supervisor is still alive after `watch.stopWaitSeconds`
- **THEN** `osq watch --stop` prints `osq watch is stopping after its running task (pid <pid>)` and exits 0

#### Scenario: Nothing to stop
- **WHEN** `osq watch --stop` runs with no live `service.json`
- **THEN** it prints `osq watch is not running in the background` and exits 0

#### Scenario: Refused combination
- **WHEN** `osq watch --background --dev` runs
- **THEN** it fails with `--background cannot be combined with --once, --dev or --allow-stale` and spawns nothing

### Requirement: Change verify rerun count
Configuration SHALL accept `gates.changeVerifyReruns`, a non-negative integer
defaulting to 1: the most times the runner reruns a failing change-level
verify at one task boundary when its failing tests are unrelated to the task,
as watcher-and-harness "Change verify rerun after unrelated failures"
describes. `0` SHALL turn reruns off. A partial `gates` block SHALL keep the
default, and any other value SHALL fail validation with an error naming
`gates.changeVerifyReruns`.

README's "Gates and permissions" SHALL describe the rerun in its "Change
verification after every task" bullet: which failures are rerun,
`gates.changeVerifyReruns` with its default of 1 and `0` turning it off, the
`change_verify_rerun` event, and the `Flaky tests:` section of `osq report`.

#### Scenario: Default rerun count
- **WHEN** `defineConfig({})` or `defineConfig({ gates: { preSpawnVerify: 'off' } })` runs
- **THEN** `gates.changeVerifyReruns` is 1

#### Scenario: Reruns off
- **WHEN** configuration declares `gates.changeVerifyReruns: 0`
- **THEN** resolved configuration retains 0 while preserving the other gate defaults

#### Scenario: Invalid rerun count
- **WHEN** `gates.changeVerifyReruns` is -1, 1.5, `NaN`, or `'one'`
- **THEN** configuration validation fails with an error naming `gates.changeVerifyReruns`

#### Scenario: README describes the rerun
- **WHEN** README's "Gates and permissions" section is read
- **THEN** its "Change verification after every task" bullet names `gates.changeVerifyReruns`, its default of 1, `change_verify_rerun`, and `Flaky tests:`

### Requirement: Format command configuration
Configuration SHALL accept `gates.formatCommand`, an optional command that
contains `{files}`, which the watcher runs on a task's changed scoped files
before its verify, as watcher-and-harness "Format before verify" describes.
It SHALL be unset by default. A set value SHALL be kept trimmed; a value that
is not a string or does not contain `{files}` SHALL fail validation with
`gates.formatCommand must be a command containing {files}`.

The `osq.config.ts` that `osq init` writes SHALL hold, right after its
commented validator example, these three comment lines:

```
  // osq formats the files a task changed in its scope before running verify;
  // {files} becomes those files, each quoted.
  // gates: { formatCommand: 'npx prettier --write {files}' },
```

README's "Gates and permissions" SHALL describe the step in a "Formatting"
bullet, and osq's own `osq.config.ts` SHALL set `gates.formatCommand` to
`pnpm exec biome check --linter-enabled=false --write --no-errors-on-unmatched {files}`.

#### Scenario: Unset by default
- **WHEN** `defineConfig({})` runs
- **THEN** `gates` has no `formatCommand`

#### Scenario: Format command kept
- **WHEN** configuration declares `gates.formatCommand: ' npx prettier --write {files} '`
- **THEN** resolved configuration holds `npx prettier --write {files}` and the other gate defaults

#### Scenario: Invalid format command
- **WHEN** `gates.formatCommand` is each value below
- **THEN** validation fails with `gates.formatCommand must be a command containing {files}`

| value |
| --- |
| `''` |
| `'npx prettier --write .'` |
| `5` |

#### Scenario: Init shows the key
- **WHEN** `osq init` scaffolds a project
- **THEN** its `osq.config.ts` holds the three comment lines right after the validator example, and loading it yields no `gates.formatCommand`

#### Scenario: osq formats its own tasks
- **WHEN** osq's own `osq.config.ts` is loaded
- **THEN** `gates.formatCommand` is `pnpm exec biome check --linter-enabled=false --write --no-errors-on-unmatched {files}`

### Requirement: Server mode is an addition to local use
osq's own decisions SHALL include an accepted, system-wide ADR whose rule is
"Server mode is an addition; an osq server runs the same command functions on
its own clone, and every command keeps working locally exactly as today.", and
AGENTS.md's project rules block SHALL carry that rule. A decision about
running osq on a server that would remove or change a local command SHALL
supersede that ADR first.

#### Scenario: Server-mode rule reaches every agent
- **WHEN** `readDecisions` reads osq's decisions folder and `checkProjectRules` checks AGENTS.md
- **THEN** an accepted ADR for `all` has that rule, the rules block holds its line, and neither reports a problem

### Requirement: Notices configuration
`osq.config.ts` MAY set `notices.maxShown`, `notices.maxTasks` and
`notices.maxResolvedFiles`, each a positive integer, and `notices.rulePaths`, a
list of non-empty scope patterns. The resolved config SHALL always hold
`notices`, defaulting to
`{ maxShown: 5, maxTasks: 6, maxResolvedFiles: 15, rulePaths: [] }`, with a
partial block keeping each missing default. `defineConfig` SHALL throw
`notices configuration must be an object` for a block that is not an object,
`notices.<key> must be a positive integer` for a count that is not one, and
`notices.rulePaths must be a list of scope patterns` for any other
`rulePaths` value. osq's own `osq.config.ts` SHALL list
`src/harness/prompt.ts` and `src/core/foundation/init-blocks.ts`, where its
executor and planner prompts are written, in `notices.rulePaths`.

#### Scenario: Default notices
- **WHEN** `osq.config.ts` has no `notices` block
- **THEN** the resolved config holds `{ maxShown: 5, maxTasks: 6, maxResolvedFiles: 15, rulePaths: [] }`

#### Scenario: Invalid notices
- **WHEN** `defineConfig` receives the row's `notices` block
- **THEN** it throws the row's error

| block | error |
| --- | --- |
| `[]` | notices configuration must be an object |
| `{ maxShown: 0 }` | notices.maxShown must be a positive integer |
| `{ maxTasks: 2.5 }` | notices.maxTasks must be a positive integer |
| `{ rulePaths: ['a', ''] }` | notices.rulePaths must be a list of scope patterns |

### Requirement: Server configuration
`validateServeConfig` SHALL also validate two optional keys of the `serve`
block and put them on `OsqConfig.serve`:

- `allowedHosts`: default `[]`. Host names the write guard accepts besides loopback, each `name` or `name:port`.
- `server`: the `osq server` settings, each defaulted on its own:
  - `port`: 4174. The loopback port the server binds.
  - `buildCheckSeconds`: 30. How often the server worker checks for a new osq build.
  - `name`: optional. The server's name the dashboard shows; when unset, the server uses `os.hostname()`.
  - `project`: optional. The project's path segment in `/p/<project>/`; when unset, the server uses the project root's folder name with every character other than a letter, digit, `.`, `_` or `-` replaced by `-`.

An invalid value SHALL throw the error in the table, and a partial block SHALL
keep each missing value's default. `OsqUserConfig` SHALL accept `serve` with
every key optional, `serve.server` included. `src/index.ts` SHALL export the
`ServeServerConfig` type. The existing `port` and `eventDebounceMs` keys and
their errors SHALL not change.

| Value | Error |
|---|---|
| `allowedHosts` not an array, or an entry that is not a non-empty string, or holds whitespace, `/` or `://` | `serve.allowedHosts must be an array of host names` |
| `server.port` not an integer from 1 through 65535 | `serve.server.port must be an integer from 1 through 65535` |
| `server.buildCheckSeconds` not a finite number greater than zero | `serve.server.buildCheckSeconds must be a finite number greater than zero` |
| `server.name` not a non-empty string | `serve.server.name must be a non-empty string` |
| `server.project` not matching `^[A-Za-z0-9][A-Za-z0-9._-]*$` | `serve.server.project must start with a letter or digit and hold only letters, digits, '.', '_' or '-'` |

#### Scenario: Server defaults
- **WHEN** `defineConfig({})` runs
- **THEN** `serve` is `{ port: 4173, eventDebounceMs: 100, allowedHosts: [], server: { port: 4174, buildCheckSeconds: 30 } }`

#### Scenario: Partial server block
- **WHEN** `defineConfig({ serve: { server: { port: 4180 } } })` runs
- **THEN** `serve.server` is `{ port: 4180, buildCheckSeconds: 30 }` and `serve.port` is 4173

#### Scenario: Invalid server values
- **WHEN** `defineConfig` runs with each value below
- **THEN** it throws an error naming the key:

| Input | Key named |
|---|---|
| `{ serve: { allowedHosts: 'box' } }` | `serve.allowedHosts` |
| `{ serve: { allowedHosts: ['https://box'] } }` | `serve.allowedHosts` |
| `{ serve: { server: { port: 0 } } }` | `serve.server.port` |
| `{ serve: { server: { buildCheckSeconds: 0 } } }` | `serve.server.buildCheckSeconds` |
| `{ serve: { server: { name: '' } } }` | `serve.server.name` |
| `{ serve: { server: { project: 'a/b' } } }` | `serve.server.project` |

### Requirement: Server commands
The CLI SHALL provide `osq server start` and `osq server stop`, in the "Setup
and running" help group, and README's command list SHALL name both.

`osq server start` SHALL fail before it starts anything with `osq server is
already running (pid <pid>). Log: <log>. Stop it with osq server stop` when
`readServerRecord` returns a live record; a process with `OSQ_SERVER_ROLE`
set is exempt from this check and from starting the watch service. Otherwise
it SHALL start the watch
service exactly as `osq watch --background` does, printing its line, when
`readWatchState` returns no live service or watcher record, and leave a live
one alone. It SHALL then spawn the same Node executable with its `execArgv`,
the `osq` entry it runs from, and `server start`, as a detached process with
`OSQ_SERVER_ROLE=supervisor`, its stdout and stderr appended to `server.log`;
write `server.json` with the child's pid, `startedAt`, the log path, and the
URL `http://127.0.0.1:<serve.server.port>/p/<project>/`; and print `osq server
is running in the background (pid <pid>) at <url>. Log: <log>`.

`osq server start` with `OSQ_SERVER_ROLE=supervisor` SHALL run
`runServiceSupervisor` with `service: 'server'`. With `OSQ_SERVER_ROLE=worker`
it SHALL run the server worker: `startWebServer` on `serve.server.port` with
`site` `{ name, project }` from "Server configuration" and a `runAction` from
`createWebActionRunner({ cwd, config }, createServerCommands())`, whose table runs
`approve`, `reject` and `retry` as `osq serve` does and runs `land` as
`landCommand(change, { ...inputs, publish: true })`. Every
`serve.server.buildCheckSeconds` the worker SHALL call a
`createServiceBuildCheck` check. On a settled new build, when no action
runs, it SHALL close the server and exit with `EXIT_NEW_BUILD`; while an
action runs, it SHALL wait for it to end first. A waiting build SHALL not stop
the worker. On SIGINT or SIGTERM the worker SHALL close the server after any
running action ends and exit 0.

`landCommand` SHALL take an optional `publish`. With it, the command SHALL
land through `landAndPublish` instead of `landChange`, with the same output,
refusals and exit codes otherwise. No CLI flag sets `publish`.

`osq server stop` SHALL send SIGTERM to a live server supervisor and wait up
to `watch.stopWaitSeconds` for it to exit, printing `osq server stopped (pid
<pid>)` when it exited, `osq server is stopping after its running action (pid
<pid>)` when it did not, and `osq server is not running` when there is no
live record. It SHALL then stop the watch service exactly as `osq watch
--stop` does, printing its line. `osq server` with no subcommand or another
one SHALL print the command's help and exit nonzero, as Commander does.

#### Scenario: Start and stop
- **WHEN** a user runs `osq server start` in a project with no live records, with `serve.server.port` set to a free port and `harness: 'mock'`, and then `osq server stop`
- **THEN** start prints the watch service line and `osq server is running in the background (pid <pid>) at http://127.0.0.1:<port>/p/<project>/. Log: <log>`, `GET <url>api/server` answers 200 with the project and a live watcher, and after stop `server.json` and `service.json` name no live pid

#### Scenario: Already running
- **WHEN** `server.json` names a live pid and the user runs `osq server start`
- **THEN** it fails with `osq server is already running (pid <pid>). Log: <log>. Stop it with osq server stop` and spawns nothing

#### Scenario: Watcher already running
- **WHEN** a terminal watcher's live `watcher.json` exists and the user runs `osq server start`
- **THEN** no watch service is started and the server starts

#### Scenario: Stop with nothing running
- **WHEN** no server and no watch service run and the user runs `osq server stop`
- **THEN** it prints `osq server is not running` and `osq watch is not running in the background`

#### Scenario: Server land publishes
- **WHEN** the server worker's runner runs `land` for change `001`
- **THEN** the land function it was built with is called once for change `001` with `publish: true` and the runner's `cwd` and config
