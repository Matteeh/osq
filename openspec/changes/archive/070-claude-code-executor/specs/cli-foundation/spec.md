# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Claude configuration and resolution
<!-- source: src/core/foundation/config-claude.ts, src/core/foundation/config.ts, src/core/foundation/harness-catalog.ts, src/index.ts, tests/claude/** -->
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
<!-- source: src/core/foundation/config-claude.ts, src/core/foundation/harness-catalog.ts, src/harness/claude/claude-exec.ts, tests/claude/** -->
A harness catalog entry MAY declare an optional `containment` function that
describes, from configuration, what the harness confines. The `claude` entry
SHALL declare it and a `diagnose` hook. The hook SHALL add a `harness-version`
check that fails when `claude --version` is below 2.1.278, naming the version
and the minimum, and a passing `harness-containment` check whose message is
the entry's containment. Claude preflight SHALL fail before any task spawns on
the same version condition.

#### Scenario: Old version
- **WHEN** `claude --version` prints `2.1.200 (Claude Code)`
- **THEN** doctor's `harness-version` check fails naming `2.1.200` and `2.1.278`, and preflight fails before any task spawns

#### Scenario: Containment report
- **WHEN** doctor runs with `claude.sandbox: true`
- **THEN** the `harness-containment` check says that Bash is sandboxed without network, that file tools are confined to the project, and that `git` is denied

### Requirement: Claude consumer guidance
<!-- source: README.md, tests/claude/readme.test.ts -->
The README SHALL describe the Claude Code harness: a config example, its
settings, the minimum version, login versus `ANTHROPIC_API_KEY` and `--bare`,
the stripped tool surface and why, the permission baseline and `git` denial,
`claude.sandbox` with its bubblewrap and socat requirement on Linux, the
honest limits of containment without the sandbox, and that planning uses the
tool-native command instead.

#### Scenario: Reading the Claude section
- **WHEN** a consumer reads the README's Claude Code section
- **THEN** it finds the flags osq passes and a statement that without `claude.sandbox` Bash is not confined
