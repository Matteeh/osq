---
title: "Planner in OSQ: interactive planning sessions, brief writer, and planner config"
depends_on:
  - "030"
verify: "osq plan smoke --brief tests/fixtures/brief.md"
features:
  reads:
    - cli-foundation
    - watcher-and-harness
    - metrics-and-reporting
---
## Goal

Run the planner inside `osq`. `osq plan <name>` creates the change folder, writes `brief.md`, and opens an interactive session with the configured planner harness and model, primed with `PLANNER.md` and the brief. The human plans in that session and approves afterwards:

1. **Planner Configuration & Manifest Attribution**:
   - `osq.config.ts` gains a `planner` block: `{ harness, model, agent? }`, validated by `defineConfig`.
   - `ManifestData` records the planner model from configuration at `osq plan` and `osq approve`.
2. **Interactive Harness Spawning**:
   - `HarnessAdapter` gains `spawnInteractive({ prompt, cwd, model, agent })` with inherited stdio and exit code resolution.
   - `OpencodeAdapter`, `AgyAdapter`, and `MockAdapter` implement interactive spawning.
3. **Opencode Planner Agent Scaffolding**:
   - `osq setup` writes `.opencode/agent/osq-planner.md` with system prompt referencing `PLANNER.md` and restricted tool permissions (`read`, `write`, `edit`, `glob`, `grep`; denying `bash`, `git`, `webfetch`, `websearch`).
   - Writes are constrained to `openspec/changes/<id>/`, and setup is idempotent across repeated runs.
4. **Interactive Planning CLI**:
   - `osq plan <name> [--brief file | -]` creates the change folder, populates `brief.md` with planner metadata and date, primes the session with 4 ordered sections (`PLANNER.md`, change ID/title, capability spec paths, `brief.md`), and spawns the interactive session.
   - `osq plan <id>` on an existing change with a brief skips creation and resumes the session.
   - `-print` outputs the opening prompt strictly to stdout without launching a process.

## Verify

`osq plan smoke --brief tests/fixtures/brief.md`

## Non-goals

- `plan.jsonl` session transcript capture and persistence (deferred to Phase 2 roadmap).
- Planning token and cost accounting / attribution (deferred to Phase 2 roadmap).
- Headless / autonomous planning mode (deferred to Phase 2 roadmap).
- Restructuring global configuration schemas beyond the `planner` block (deferred to R6).

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Config with planner block | `defineConfig` validates `planner.harness` and `planner.model` as non-empty strings, and `planner.harness` as a recognized adapter |
| Manifest generation (`buildManifest`) | Populates `manifest.planner` with `config.planner.model` (or `null` when omitted) |
| Harness interactive spawn (`spawnInteractive`) | Spawns harness binary with `stdio: 'inherit'`, without stream parsing, and resolves with exit code |
| Opencode setup (`osq setup`) | Writes `.opencode/agent/osq-planner.md` with tool permissions allowing `read`, `write`, `edit`, `glob`, `grep` and denying `bash`, `git`, `webfetch`, `websearch`; repeated runs are byte-identical |
| New planning command (`osq plan <name>`) | Creates change folder via `createNewSpec`, writes `brief.md` with `planner` and `date` frontmatter, constructs opening prompt with 4 ordered sections, and invokes `spawnInteractive` |
| Resuming existing change (`osq plan <id>`) | Locates existing change folder containing `brief.md`, skips `createNewSpec`, and opens interactive session |
| Print flag (`osq plan <name> -print`) | Creates folder and `brief.md`, outputs opening prompt strictly to stdout, and exits without spawning harness |

### Requirements and Scenarios

#### Requirement: Planner configuration validation
<!-- source: src/core/config.ts, tests/config-planner.test.ts -->
The configuration subsystem SHALL support and validate an optional `planner` block defining `harness`, `model`, and optional `agent`.
- **WHEN** user defines `planner: { harness, model }` in `osq.config.ts`
- **THEN** `defineConfig` validates that `harness` is a supported harness name and `model` is a non-empty string

#### Scenario: Rejection of invalid planner configuration
- **WHEN** `planner` is configured with an empty string or unrecognized harness
- **THEN** `defineConfig` throws a descriptive validation error

#### Requirement: Manifest planner model recording
<!-- source: src/core/manifest.ts, tests/config-planner.test.ts -->
The manifest builder SHALL record the configured planner model in `ManifestData`.
- **WHEN** `buildManifest` executes for a change folder
- **THEN** `manifest.planner` contains `config.planner.model` or `null` if unconfigured

#### Requirement: Interactive harness adapter spawning
<!-- source: src/harness/types.ts, src/harness/opencode.ts, src/harness/agy.ts, src/harness/mock.ts, tests/harness-interactive.test.ts -->
Harness adapters SHALL implement `spawnInteractive` inheriting terminal stdio and returning the process exit code.
- **WHEN** `adapter.spawnInteractive({ prompt, cwd, model, agent })` is invoked
- **THEN** adapter spawns the process with inherited stdio, uncaptured stdout/stderr, and resolves with the process exit code

#### Scenario: Opencode interactive argv resolution
- **WHEN** `OpencodeAdapter.spawnInteractive` executes
- **THEN** it executes the resolved binary with `[prompt, '--dir', cwd]`, `--model` and `--agent` flags if provided, without headless `run` or `--format json` flags

#### Scenario: Agy interactive argv resolution
- **WHEN** `AgyAdapter.spawnInteractive` executes
- **THEN** it executes the resolved binary with `-i <prompt>`, `--model` and `--agent` flags if provided, and `--dangerously-skip-permissions` if configured

#### Requirement: Opencode planner agent configuration
<!-- source: src/harness/opencode.ts, tests/opencode-planner-setup.test.ts -->
The setup command for the opencode harness SHALL generate `.opencode/agent/osq-planner.md` with restricted planning tool permissions.
- **WHEN** `osq setup` executes with `opencode` harness configured
- **THEN** system generates `.opencode/agent/osq-planner.md` permitting `read`, `write`, `edit`, `glob`, `grep` and denying `bash`, `git`, `webfetch`, `websearch`

#### Scenario: Opencode setup idempotence
- **WHEN** `osq setup` runs repeatedly against an existing `.opencode/agent/osq-planner.md`
- **THEN** file remains byte-identical across runs

#### Requirement: Interactive planning command
<!-- source: src/cli/plan.ts, src/cli/index.ts, tests/plan.test.ts -->
The CLI SHALL provide `osq plan <name> [--brief <file> | -] [-print]` to initialize changes, record briefs, and launch interactive planner sessions.
- **WHEN** `osq plan <name>` executes
- **THEN** system creates change folder, writes `brief.md` with planner and date metadata, constructs opening prompt with the 4 ordered sections (`PLANNER.md`, change ID/title, capability spec paths, `brief.md`), and launches `spawnInteractive`

#### Scenario: Print mode outputs prompt to stdout
- **WHEN** `osq plan <name> -print` executes
- **THEN** opening prompt is written exclusively to stdout without launching an interactive session

#### Scenario: Resuming plan on existing change
- **WHEN** `osq plan <id>` is invoked on an existing change folder with `brief.md`
- **THEN** folder creation is skipped and the interactive session opens directly on that change

## Human steps

None.

## Delta

This change adds requirements for planner configuration validation, interactive planning commands, and planner agent scaffolding to `cli-foundation`; adds interactive harness session execution to `watcher-and-harness`; and records planner model attribution in `metrics-and-reporting`.