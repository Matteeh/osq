## ADDED Requirements

### Requirement: Config file errors
<!-- source: src/core/foundation/config.ts, src/core/foundation/package-root.ts, tests/config-load-errors.test.ts -->
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
- **WHEN** a temporary project has only the `osq.config.ts` that `osq init` writes, with its `'agy'` replaced by `'codex'`, `OSQ_HARNESS` unset, and no `node_modules`
- **THEN** `loadConfig` resolves with harness `codex` from that file

#### Scenario: Doctor
- **WHEN** `osq doctor` runs with a config file that fails to validate
- **THEN** its `config` check fails with `failed to load: ` followed by the `ConfigLoadError` message

### Requirement: Config error exit
<!-- source: src/cli/bin.ts, src/cli/run.ts, src/cli/init.ts, tests/cli-config-errors.test.ts -->
When any command rejects with a `ConfigLoadError`, the command line SHALL print
`Error: <message>` to stderr, without a stack trace, and exit 1. `osq init`
SHALL load config like every other command and SHALL NOT fall back to the
defaults. Any other error SHALL propagate as before.

#### Scenario: Status with a broken config
- **WHEN** `osq status` runs in a project whose config fails to validate
- **THEN** stderr holds `Error: Failed to load ` and the file, and the exit code is 1

#### Scenario: Init with a broken config
- **WHEN** `osq init` runs in that project
- **THEN** it prints the same error, exits 1, and scaffolds nothing
