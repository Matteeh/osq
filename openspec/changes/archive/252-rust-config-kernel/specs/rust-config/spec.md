# Spec Delta: rust-config

## Purpose
The config kernel reads a project's `osq.toml` into typed settings, with TypeScript's default for every key the file leaves out, so no Rust crate writes a limit or a timeout as a number and none reads the file itself.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/config/** -->
The rust-config capability SHALL own the `osq-kernel-config` crate:
its manifest, its source and its tests.

#### Scenario: Config crate ownership
- **WHEN** file ownership is resolved for the config kernel
- **THEN** system maps `crates/kernel/config/**` to rust-config

### Requirement: Config file
`load_config(root: &Path) -> Result<Config, ConfigError>` in
`osq-kernel-config` SHALL read `<root>/osq.toml` as UTF-8 text and return
`parse_config` of it. When the file does not exist it SHALL return
`Config::default()`. Any other read failure, such as the path being a
directory or the text not being UTF-8, SHALL be `ConfigError::Read` with
`path` set to `<root>/osq.toml` and `message` set to the IO error's display
text. `load_config` is the crate's only function that touches the file
system.

`parse_config(text: &str) -> Result<Config, ConfigError>` SHALL be pure.
It parses `text` as a TOML table, and text that is not valid TOML SHALL be
`ConfigError::Syntax` with the parser's display text as `message`. It then
reads the top-level keys `maxConcurrency`, `timeouts`, `vcs`, `executor`,
`planner` and `validator` into `Config`, whose fields are
`max_concurrency`, `timeouts`, `vcs`, `executor`, `planner` and
`validator`, as the requirements of each key say. `Config` SHALL derive
`Debug`, `Clone`, `PartialEq` and `Eq`, and `Config::default()` SHALL
equal `parse_config("")`.

Each table SHALL be checked for unknown keys before any of its values is
read, and the first unknown key in byte order SHALL be reported. After the
check of the top-level table, the keys SHALL be read in the order above,
and inside each table in the order its requirement lists them, so the
first problem in that order is the one returned. The file is never partly
applied.

#### Scenario: Missing osq.toml
- **WHEN** `load_config` runs on an empty temporary folder
- **THEN** it returns `Ok(Config::default())`

#### Scenario: Loaded osq.toml
- **WHEN** `load_config` runs on a temporary folder whose `osq.toml` holds `maxConcurrency = 4`
- **THEN** it returns a `Config` whose `max_concurrency` is 4 and whose other fields equal `Config::default()`'s

#### Scenario: Unreadable osq.toml
- **WHEN** `load_config` runs on a temporary folder where `osq.toml` is a directory
- **THEN** it returns `ConfigError::Read` whose `path` is that folder joined with `osq.toml` and whose `message` is not empty

#### Scenario: Not TOML
- **WHEN** `parse_config` reads `maxConcurrency = 1\n[vcs`
- **THEN** it returns `ConfigError::Syntax` whose `message` is not empty

#### Scenario: Unknown top-level key
- **WHEN** `parse_config` reads `[gates]\nbaselineVerify = "pnpm verify"\n[limits]\nmaxScopeFiles = 9`
- **THEN** it returns `ConfigError::UnknownKey` with `key` `gates`

### Requirement: Config errors
`ConfigError` SHALL be an enum with the variants `Read { path: PathBuf,
message: String }`, `Syntax { message: String }`, `UnknownKey { key:
String }`, `WrongType { key: String, expected: &'static str }` and
`InvalidValue { key: String, reason: String }`, deriving `Debug`, `Clone`,
`PartialEq` and `Eq` and implementing `std::error::Error` with no source.

A `key` SHALL be the dotted path of the key in the file: the key itself at
the top level, such as `maxConcurrency`, and `<table>.<key>` inside a
table, such as `timeouts.gitSeconds`. `expected` SHALL be one of `a
table`, `an integer`, `a boolean` and `a string`.

The shared value rules SHALL be:

- a table key whose value is not a TOML table is `WrongType` with `a table`;
- an integer key whose value is not a TOML integer, a float included, is `WrongType` with `an integer`, and one below 1 is `InvalidValue` with reason `must be a positive integer`;
- a boolean key whose value is not a TOML boolean is `WrongType` with `a boolean`;
- a string key whose value is not a TOML string is `WrongType` with `a string`, and one that is empty after trimming is `InvalidValue` with reason `must be a non-empty string`; a string is kept trimmed unless its requirement says otherwise.

#### Scenario: Error texts
- **WHEN** each error below is displayed
- **THEN** its text is the one in the table

| Error | Text |
|---|---|
| `Read { path: "/p/osq.toml", message: "Is a directory (os error 21)" }` | `cannot read /p/osq.toml: Is a directory (os error 21)` |
| `Syntax { message: "unclosed table" }` | `osq.toml is not valid TOML: unclosed table` |
| `UnknownKey { key: "timeouts.gitSecs" }` | `timeouts.gitSecs is not an osq.toml key` |
| `WrongType { key: "vcs.enabled", expected: "a boolean" }` | `vcs.enabled must be a boolean` |
| `InvalidValue { key: "maxConcurrency", reason: "must be a positive integer" }` | `maxConcurrency must be a positive integer` |

### Requirement: Timeouts and concurrency
`maxConcurrency` SHALL be an integer read into `Config.max_concurrency: u64`,
default 1. `timeouts` SHALL be a table read into `Config.timeouts`, a
`Timeouts` struct of `std::time::Duration` fields deriving `Debug`, `Clone`,
`Copy`, `PartialEq` and `Eq`. Its keys, in reading order, are integers:

| Key | Field | Unit | Default |
|---|---|---|---|
| `staleLockSeconds` | `stale_lock` | seconds | 2700 |
| `taskTimeoutSeconds` | `task_timeout` | seconds | 1800 |
| `verifyTimeoutSeconds` | `verify_timeout` | seconds | 600 |
| `harnessPreflightSeconds` | `harness_preflight` | seconds | 10 |
| `harnessKillGracePeriodMs` | `harness_kill_grace` | milliseconds | 5000 |
| `gitSeconds` | `git` | seconds | 10 |
| `gitCommitSeconds` | `git_commit` | seconds | 120 |
| `gitRemoteSeconds` | `git_remote` | seconds | 120 |

The defaults are TypeScript's `DEFAULT_CONFIG.timeouts`, `DEFAULT_GIT_SECONDS`,
`DEFAULT_GIT_COMMIT_SECONDS` and `DEFAULT_GIT_REMOTE_SECONDS`, and
`DEFAULT_CONFIG.maxConcurrency`.

#### Scenario: Timeout defaults
- **WHEN** `parse_config` reads each text below
- **THEN** `max_concurrency` is 1 and `timeouts` holds every default of the table above, with `stale_lock` `Duration::from_secs(2700)` and `harness_kill_grace` `Duration::from_millis(5000)`

| Text |
|---|
| the empty text |
| `[timeouts]` |
| `maxConcurrency = 1\n[timeouts]\ngitSeconds = 10` |

#### Scenario: Every timeout set
- **WHEN** `parse_config` reads `maxConcurrency = 3\n[timeouts]\nstaleLockSeconds = 3600\ntaskTimeoutSeconds = 2400\nverifyTimeoutSeconds = 900\nharnessPreflightSeconds = 20\nharnessKillGracePeriodMs = 2500\ngitSeconds = 15\ngitCommitSeconds = 180\ngitRemoteSeconds = 240`
- **THEN** `max_concurrency` is 3 and `timeouts` holds, in field order, 3600 s, 2400 s, 900 s, 20 s, 2500 ms, 15 s, 180 s and 240 s

#### Scenario: Timeout errors
- **WHEN** `parse_config` reads each text below
- **THEN** it returns the error in the table

| Text | Error |
|---|---|
| `maxConcurrency = 0` | `InvalidValue { key: "maxConcurrency", reason: "must be a positive integer" }` |
| `maxConcurrency = "3"` | `WrongType { key: "maxConcurrency", expected: "an integer" }` |
| `timeouts = 5` | `WrongType { key: "timeouts", expected: "a table" }` |
| `[timeouts]\ngitSecs = 5` | `UnknownKey { key: "timeouts.gitSecs" }` |
| `[timeouts]\ngitSeconds = 1.5` | `WrongType { key: "timeouts.gitSeconds", expected: "an integer" }` |
| `[timeouts]\ngitSeconds = -1` | `InvalidValue { key: "timeouts.gitSeconds", reason: "must be a positive integer" }` |
| `[timeouts]\nstaleLockSeconds = 0\ngitSeconds = 0` | `InvalidValue { key: "timeouts.staleLockSeconds", reason: "must be a positive integer" }` |
| `[timeouts]\nzzz = 1\ngitSeconds = 0` | `UnknownKey { key: "timeouts.zzz" }` |

### Requirement: Version control settings
`vcs` SHALL be a table read into `Config.vcs`, a `VcsConfig` struct deriving
`Debug`, `Clone`, `PartialEq` and `Eq`. Its keys, in reading order:

| Key | Field | Type | Default |
|---|---|---|---|
| `enabled` | `enabled` | `bool` | `false` |
| `author` | `author` | `Option<String>` | `None` |
| `worktreeRoot` | `worktree_root` | `String` | `~/.osq/worktrees` |
| `defaultBranch` | `default_branch` | `Option<String>` | `None` |
| `prepare` | `prepare` | `Option<String>` | `None` |
| `afterLand` | `after_land` | `Option<String>` | `None` |
| `manualEdits` | `manual_edits` | `ManualEdits` | `ManualEdits::Keep` |

`author` SHALL be kept as written, not trimmed, and SHALL look like
`Name <email>` as TypeScript's `^\S.*\s<[^<>]+>$` says: its first character
is not whitespace, it ends with `<`, an email of one or more characters
holding neither `<` nor `>`, and `>`, and the character before that `<` is
whitespace. Any other author string is `InvalidValue` with reason
`must look like "Name <email>"`. `enabled = true` with no `author` is
`InvalidValue` with key `vcs.author` and reason
`is required when vcs.enabled is true`. `ManualEdits` is an enum of `Keep`
and `Block`, read from exactly `"keep"` or `"block"`; any other string is
`InvalidValue` with reason `must be "keep" or "block"`. The other strings
follow the shared string rule. `default_branch` stays `None` when unset,
since the vcs kernel asks origin before it falls back to `main`.

#### Scenario: Version control defaults
- **WHEN** `parse_config` reads each of the empty text, `[vcs]` and `[vcs]\nenabled = false`
- **THEN** `vcs` holds every default of the table above

#### Scenario: Every version control key set
- **WHEN** `parse_config` reads `[vcs]\nenabled = true\nauthor = "osq <osq@noreply.invalid>"\nworktreeRoot = " /srv/osq/worktrees "\ndefaultBranch = "trunk"\nprepare = "pnpm install --frozen-lockfile"\nafterLand = "pnpm build"\nmanualEdits = "block"`
- **THEN** `vcs` is enabled, with author `osq <osq@noreply.invalid>`, worktree root `/srv/osq/worktrees`, default branch `trunk`, prepare `pnpm install --frozen-lockfile`, after land `pnpm build` and `ManualEdits::Block`

#### Scenario: Version control errors
- **WHEN** `parse_config` reads each text below
- **THEN** it returns the error in the table

| Text | Error |
|---|---|
| `vcs = "on"` | `WrongType { key: "vcs", expected: "a table" }` |
| `[vcs]\nbranch = "main"` | `UnknownKey { key: "vcs.branch" }` |
| `[vcs]\nenabled = "yes"` | `WrongType { key: "vcs.enabled", expected: "a boolean" }` |
| `[vcs]\nenabled = true` | `InvalidValue { key: "vcs.author", reason: "is required when vcs.enabled is true" }` |
| `[vcs]\nauthor = 7` | `WrongType { key: "vcs.author", expected: "a string" }` |
| `[vcs]\nauthor = "osq"` | `InvalidValue { key: "vcs.author", reason: "must look like \"Name <email>\"" }` |
| `[vcs]\nauthor = "osq <>"` | `InvalidValue { key: "vcs.author", reason: "must look like \"Name <email>\"" }` |
| `[vcs]\nauthor = " osq <a@b>"` | `InvalidValue { key: "vcs.author", reason: "must look like \"Name <email>\"" }` |
| `[vcs]\nauthor = "osq<a@b>"` | `InvalidValue { key: "vcs.author", reason: "must look like \"Name <email>\"" }` |
| `[vcs]\nauthor = "osq <a@b> "` | `InvalidValue { key: "vcs.author", reason: "must look like \"Name <email>\"" }` |
| `[vcs]\nauthor = "a <b<c>"` | `InvalidValue { key: "vcs.author", reason: "must look like \"Name <email>\"" }` |
| `[vcs]\nprepare = "  "` | `InvalidValue { key: "vcs.prepare", reason: "must be a non-empty string" }` |
| `[vcs]\nmanualEdits = "drop"` | `InvalidValue { key: "vcs.manualEdits", reason: "must be \"keep\" or \"block\"" }` |

#### Scenario: Short author accepted
- **WHEN** `parse_config` reads `[vcs]\nauthor = "a <b>"`
- **THEN** `vcs.author` is `Some("a <b>")` and `vcs.enabled` is `false`

### Requirement: Role settings
`executor`, `planner` and `validator` SHALL be tables read into
`Config.executor`, `Config.planner` and `Config.validator`. A harness name
is a string read into the enum `Harness`, one of `Agy`, `Opencode`, `Mock`,
`Codex`, `Pi` and `Claude`, whose `as_str` gives `agy`, `opencode`, `mock`,
`codex`, `pi` and `claude`; any other string, after trimming, is
`InvalidValue` with reason
`must be one of: agy, opencode, mock, codex, pi, claude`. Models and agents
follow the shared string rule. Every type here derives `Debug`, `Clone`,
`PartialEq` and `Eq`, and `Harness` also `Copy`.

`executor`'s keys, in reading order, are `harness` and `model`, read into
`ExecutorConfig { harness: Harness, model: Option<String> }`. `harness`
defaults to `Agy`. When `model` is unset it takes the default of the
executor's harness, as TypeScript's `DEFAULT_CONFIG` gives one:

| Harness | Default model |
|---|---|
| `agy` | `gemini-3.8-flash-high` |
| `opencode` | `deepseek/deepseek-flash` |
| `mock`, `codex`, `pi`, `claude` | `None` |

`planner`'s keys, in reading order, are `harness`, `model` and `agent`, read
into `PlannerConfig { harness: Harness, model: Option<String>, agent:
Option<String> }`. Without a `planner` table the planner follows the
executor, as TypeScript's `resolvePlannerSelection` does: the executor's
harness and model, and agent `osq-planner` when that harness is `opencode`,
else `None`. With a `planner` table, a missing `harness` or `model` is
`InvalidValue` with reason `is required`, and an `agent` given for `codex`,
`pi` or `claude` is `InvalidValue` with key `planner.agent` and reason
`is not supported by the <harness> harness`. A missing agent is
`osq-planner` for `opencode` and `None` for the others.

`validator`'s keys, in reading order, are `enabled`, `harness`, `model` and
`timeoutSeconds`, read into `ValidatorConfig { enabled: bool, harness:
Option<Harness>, model: Option<String>, timeout: Duration }`. Without a
`validator` table, `Config.validator` is `None`. With one, `enabled`
defaults to `true`, `timeoutSeconds` is an integer defaulting to 900, and
while `enabled` is `true` a missing `harness` or `model` is `InvalidValue`
with reason `is required when validator.enabled is true`.

#### Scenario: Role defaults
- **WHEN** `parse_config` reads the empty text
- **THEN** `executor` is `Agy` with model `gemini-3.8-flash-high`, `planner` is `Agy` with model `gemini-3.8-flash-high` and no agent, and `validator` is `None`

#### Scenario: Executor model by harness
- **WHEN** `parse_config` reads `[executor]\nharness = "<harness>"` for each harness below
- **THEN** `executor` and `planner` both hold that harness and the model in the table, and `planner.agent` is the agent in the table

| Harness | Model | Planner agent |
|---|---|---|
| `agy` | `Some("gemini-3.8-flash-high")` | `None` |
| `opencode` | `Some("deepseek/deepseek-flash")` | `Some("osq-planner")` |
| `mock` | `None` | `None` |
| `codex` | `None` | `None` |
| `pi` | `None` | `None` |
| `claude` | `None` | `None` |

#### Scenario: Every role key set
- **WHEN** `parse_config` reads `[executor]\nharness = "pi"\nmodel = " deepseek/deepseek-flash "\n[planner]\nharness = "opencode"\nmodel = "opencode-go/deepseek-v4.1-flash"\nagent = "osq-architect"\n[validator]\nenabled = true\nharness = "claude"\nmodel = "claude-opus-5-5"\ntimeoutSeconds = 1200`
- **THEN** `executor` is `Pi` with model `deepseek/deepseek-flash`, `planner` is `Opencode` with model `opencode-go/deepseek-v4.1-flash` and agent `osq-architect`, and `validator` is enabled with `Claude`, model `claude-opus-5-5` and a 1200-second timeout

#### Scenario: Role tables with defaults
- **WHEN** `parse_config` reads each text below
- **THEN** the role it sets is the value in the table

| Text | Value |
|---|---|
| `[executor]\nmodel = "m"` | `executor` is `Agy` with model `Some("m")` |
| `[planner]\nharness = "opencode"\nmodel = "m"` | `planner` is `Opencode` with model `Some("m")` and agent `Some("osq-planner")` |
| `[planner]\nharness = "agy"\nmodel = "m"\nagent = "a"` | `planner` is `Agy` with model `Some("m")` and agent `Some("a")` |
| `[validator]\nharness = "claude"\nmodel = "m"` | `validator` is `Some` enabled with `Some(Claude)`, model `Some("m")` and a 900-second timeout |
| `[validator]\nenabled = false` | `validator` is `Some` disabled with no harness, no model and a 900-second timeout |

#### Scenario: Role errors
- **WHEN** `parse_config` reads each text below
- **THEN** it returns the error in the table

| Text | Error |
|---|---|
| `executor = "pi"` | `WrongType { key: "executor", expected: "a table" }` |
| `[executor]\nharnes = "pi"` | `UnknownKey { key: "executor.harnes" }` |
| `[executor]\nharness = "gpt"` | `InvalidValue { key: "executor.harness", reason: "must be one of: agy, opencode, mock, codex, pi, claude" }` |
| `[executor]\nharness = 1` | `WrongType { key: "executor.harness", expected: "a string" }` |
| `[executor]\nmodel = ""` | `InvalidValue { key: "executor.model", reason: "must be a non-empty string" }` |
| `[planner]\nmodel = "m"` | `InvalidValue { key: "planner.harness", reason: "is required" }` |
| `[planner]\nharness = "pi"` | `InvalidValue { key: "planner.model", reason: "is required" }` |
| `[planner]\nharness = "pi"\nmodel = "m"\nagent = "a"` | `InvalidValue { key: "planner.agent", reason: "is not supported by the pi harness" }` |
| `[planner]\nharness = "codex"\nmodel = "m"\nagent = "a"` | `InvalidValue { key: "planner.agent", reason: "is not supported by the codex harness" }` |
| `[planner]\nharness = "claude"\nmodel = "m"\nagent = "a"` | `InvalidValue { key: "planner.agent", reason: "is not supported by the claude harness" }` |
| `[validator]\nretries = 1` | `UnknownKey { key: "validator.retries" }` |
| `[validator]\nenabled = 1` | `WrongType { key: "validator.enabled", expected: "a boolean" }` |
| `[validator]\nmodel = "m"` | `InvalidValue { key: "validator.harness", reason: "is required when validator.enabled is true" }` |
| `[validator]\nharness = "claude"` | `InvalidValue { key: "validator.model", reason: "is required when validator.enabled is true" }` |
| `[validator]\nenabled = false\ntimeoutSeconds = 0` | `InvalidValue { key: "validator.timeoutSeconds", reason: "must be a positive integer" }` |
