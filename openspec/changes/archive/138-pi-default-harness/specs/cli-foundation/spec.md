## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Pi consumer guidance
The README SHALL describe the Pi harness: that `osq init` scaffolds it as the
default harness, its settings and their precedence, installation, the tested
version range, credentials and `pi auth check`, that setup writes no Pi files
because Pi reads `AGENTS.md`, the flags osq passes, that Pi has no sandbox or
permission prompts so nothing confines its agent, and that Pi cannot plan.

#### Scenario: Reading the Pi section
- **WHEN** a consumer reads the README's Pi section
- **THEN** it finds a config example with placeholder provider and model, and an honest statement that task scope is a protocol, not confinement

## REMOVED Requirements

### Requirement: Codex consumer guidance
**Reason**: Its scenario "Codex is the scaffolded default" stopped being true when `osq init` switched to pi, and a MODIFIED block cannot drop a scenario.
**Migration**: None. "Codex guidance" keeps the rest of its text and both other scenarios, and "Scaffolded harness default" holds the default.
