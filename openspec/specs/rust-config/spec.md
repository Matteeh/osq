# rust-config Specification

## Purpose
The config kernel reads a project's `osq.toml` into typed settings, with TypeScript's default for every key the file leaves out, so no Rust crate writes a limit or a timeout as a number and none reads the file itself.

## Requirements

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
`planner`, `validator`, `pi`, `agy`, `opencode`, `codex`, `claude`,
`limits`, `gates`, `planning` and `bannedWords` into `Config`, whose
fields are `max_concurrency`, `timeouts`, `vcs`, `executor`, `planner`,
`validator`, `pi`, `agy`, `opencode`, `codex`, `claude`, `limits`,
`gates`, `planning` and `banned_words`, as the requirements of each key
say. `Config` SHALL derive `Debug`, `Clone` and `PartialEq`, but not `Eq`,
since `planning.prices` holds floating-point prices, and
`Config::default()` SHALL equal `parse_config("")`.

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
- **WHEN** `parse_config` reads `[server]\nport = 4174\n[limits]\nmaxScopeFiles = 9`
- **THEN** it returns `ConfigError::UnknownKey` with `key` `server`

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

### Requirement: Pi settings
`pi` SHALL be a table read into `Config.pi`, a `PiConfig` struct deriving
`Debug`, `Clone`, `Default`, `PartialEq` and `Eq`, as TypeScript's
`validatePiConfig` reads it. Its keys, in reading order, are `bin`,
`provider`, `model` and `thinking`, read into the `Option<String>` fields
of the same names. Each follows the shared string rule and is `None` when
unset, so an absent `pi` table gives `PiConfig::default()`.

#### Scenario: Pi settings read
- **WHEN** `parse_config` reads each row's text
- **THEN** it returns the row's result:

| Text | Result |
|---|---|
| empty | `pi` equals `PiConfig::default()` |
| `[pi]` | `pi` equals `PiConfig::default()` |
| `[pi]\nbin = " /opt/pi/bin/pi "\nprovider = " deepseek "\nmodel = "deepseek/deepseek-flash"\nthinking = "high"` | `pi` holds `bin` `/opt/pi/bin/pi`, `provider` `deepseek`, `model` `deepseek/deepseek-flash` and `thinking` `high` |
| `[pi]\nprovider = "deepseek"` | `pi` holds `provider` `deepseek` and no other field |
| `[pi]\nbin = "  "` | `InvalidValue` with key `pi.bin` and reason `must be a non-empty string` |
| `[pi]\nprovider = ""` | `InvalidValue` with key `pi.provider` and reason `must be a non-empty string` |
| `[pi]\nmodel = " "` | `InvalidValue` with key `pi.model` and reason `must be a non-empty string` |
| `[pi]\nthinking = ""` | `InvalidValue` with key `pi.thinking` and reason `must be a non-empty string` |
| `[pi]\nmodel = 3` | `WrongType` with key `pi.model` and expected `a string` |
| `[pi]\nharness = "pi"` | `UnknownKey` with key `pi.harness` |
| `pi = "pi"` | `WrongType` with key `pi` and expected `a table` |

### Requirement: Lint limits
`limits` SHALL be a table read into `Config.limits`, a `Limits` struct of
`u64` fields deriving `Debug`, `Clone`, `Copy`, `PartialEq` and `Eq`, as
TypeScript merges `limits` over `DEFAULT_CONFIG.limits`. Its keys, in
reading order, follow the shared integer rule and take the default when
unset, so an absent `limits` table gives `Limits::default()`:

| Key | Field | Default |
|---|---|---|
| `maxScopeFiles` | `max_scope_files` | 8 |
| `maxFeatureWrites` | `max_feature_writes` | 2 |
| `maxContractTables` | `max_contract_tables` | 1 |
| `maxAcceptanceLines` | `max_acceptance_lines` | 7 |
| `importGraphDepth` | `import_graph_depth` | 2 |
| `maxListedImporters` | `max_listed_importers` | 8 |
| `maxRuleLength` | `max_rule_length` | 160 |
| `maxProjectRules` | `max_project_rules` | 10 |
| `cardOutputLines` | `card_output_lines` | 20 |
| `markerOutputLines` | `marker_output_lines` | 40 |
| `markerLineChars` | `marker_line_chars` | 400 |
| `maxListedLineEndings` | `max_listed_line_endings` | 5 |

The defaults are TypeScript's `DEFAULT_CONFIG.limits`, each a named
constant in the config crate.

#### Scenario: Limit defaults
- **WHEN** `parse_config` reads each text below
- **THEN** `limits` equals `Limits::default()`, which holds every default of the table above, `max_scope_files` 8 and `max_listed_line_endings` 5 among them

| Text |
|---|
| the empty text |
| `[limits]` |
| `[limits]\nmaxScopeFiles = 8` |

#### Scenario: Every limit set
- **WHEN** `parse_config` reads `[limits]\nmaxScopeFiles = 11\nmaxFeatureWrites = 12\nmaxContractTables = 13\nmaxAcceptanceLines = 14\nimportGraphDepth = 15\nmaxListedImporters = 16\nmaxRuleLength = 17\nmaxProjectRules = 18\ncardOutputLines = 19\nmarkerOutputLines = 20\nmarkerLineChars = 21\nmaxListedLineEndings = 22`
- **THEN** `limits` holds, in field order, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21 and 22

#### Scenario: One limit set
- **WHEN** `parse_config` reads `[limits]\n<key> = 99` for each key below
- **THEN** `limits` holds 99 in the row's field and the default in every other field

| Key | Field |
|---|---|
| `maxScopeFiles` | `max_scope_files` |
| `maxFeatureWrites` | `max_feature_writes` |
| `maxContractTables` | `max_contract_tables` |
| `maxAcceptanceLines` | `max_acceptance_lines` |
| `importGraphDepth` | `import_graph_depth` |
| `maxListedImporters` | `max_listed_importers` |
| `maxRuleLength` | `max_rule_length` |
| `maxProjectRules` | `max_project_rules` |
| `cardOutputLines` | `card_output_lines` |
| `markerOutputLines` | `marker_output_lines` |
| `markerLineChars` | `marker_line_chars` |
| `maxListedLineEndings` | `max_listed_line_endings` |

#### Scenario: Each limit refuses zero
- **WHEN** `parse_config` reads `[limits]\n<key> = 0` for each key of the "One limit set" table
- **THEN** it returns `InvalidValue { key: "limits.<key>", reason: "must be a positive integer" }`, such as `limits.maxScopeFiles` for `maxScopeFiles`

#### Scenario: Limit errors
- **WHEN** `parse_config` reads each text below
- **THEN** it returns the error in the table

| Text | Error |
|---|---|
| `limits = 5` | `WrongType { key: "limits", expected: "a table" }` |
| `[limits]\nmaxScopeFile = 9` | `UnknownKey { key: "limits.maxScopeFile" }` |
| `[limits]\nzzz = 1\nmaxScopeFiles = 0` | `UnknownKey { key: "limits.zzz" }` |
| `[limits]\nmaxScopeFiles = "8"` | `WrongType { key: "limits.maxScopeFiles", expected: "an integer" }` |
| `[limits]\nmarkerLineChars = 2.5` | `WrongType { key: "limits.markerLineChars", expected: "an integer" }` |
| `[limits]\nmaxRuleLength = -1` | `InvalidValue { key: "limits.maxRuleLength", reason: "must be a positive integer" }` |
| `[limits]\nmaxScopeFiles = 0\nmaxListedLineEndings = 0` | `InvalidValue { key: "limits.maxScopeFiles", reason: "must be a positive integer" }` |

### Requirement: Banned words
`bannedWords` SHALL be a list read into `Config.banned_words:
Vec<BannedWord>`, as TypeScript's `validateBannedWordsConfig` reads it.
`BannedWord` SHALL be a struct with the fields `word: String` and `paths:
Vec<String>`, deriving `Debug`, `Clone`, `PartialEq` and `Eq`. An absent
`bannedWords` gives an empty list. The list may be written as
`[[bannedWords]]` tables or as an inline array; both are a TOML array of
tables.

Each entry is a table whose keys are `word` and `paths`. The entries are
read in file order. For each entry, its keys SHALL be checked first, and an
unknown key SHALL be `UnknownKey` with `key` `bannedWords.<key>`. Then
`word` SHALL be a string that is not empty after trimming, and `paths` SHALL
be a list of at least one string, each not empty after trimming. The word
and every path are kept trimmed, and the paths keep their order.

Every other fault, whether `bannedWords` is not a list, an entry is not a
table, or `word` or `paths` is missing, of the wrong type or empty, SHALL be
`InvalidValue` with `key` `bannedWords` and reason `must be a list of {
word, paths } entries`, so its text is TypeScript's error text,
`bannedWords must be a list of { word, paths } entries`.

#### Scenario: Banned words read
- **WHEN** `parse_config` reads each row's text
- **THEN** `banned_words` is the row's list

| Text | `banned_words` |
|---|---|
| the empty text | empty |
| `bannedWords = []` | empty |
| `[[bannedWords]]\nword = " skipped "\npaths = [" src/** ", "crates/**"]` | word `skipped` with paths `src/**` and `crates/**` |
| `[[bannedWords]]\nword = "skipped"\npaths = ["src/**"]\n[[bannedWords]]\nword = "todo"\npaths = ["crates/**"]` | word `skipped` with path `src/**`, then word `todo` with path `crates/**` |
| `bannedWords = [{ word = "skipped", paths = ["src/**"] }]` | word `skipped` with path `src/**` |

#### Scenario: Banned word errors
- **WHEN** `parse_config` reads each row's text
- **THEN** it returns the row's error, where "list error" is `InvalidValue { key: "bannedWords", reason: "must be a list of { word, paths } entries" }`, whose text is `bannedWords must be a list of { word, paths } entries`

| Text | Error |
|---|---|
| `bannedWords = "skipped"` | list error |
| `bannedWords = ["skipped"]` | list error |
| `[[bannedWords]]\npaths = ["src/**"]` | list error |
| `[[bannedWords]]\nword = " "\npaths = ["src/**"]` | list error |
| `[[bannedWords]]\nword = 3\npaths = ["src/**"]` | list error |
| `[[bannedWords]]\nword = "skipped"` | list error |
| `[[bannedWords]]\nword = "skipped"\npaths = []` | list error |
| `[[bannedWords]]\nword = "skipped"\npaths = "src/**"` | list error |
| `[[bannedWords]]\nword = "skipped"\npaths = ["src/**", " "]` | list error |
| `[[bannedWords]]\nword = "skipped"\npaths = [1]` | list error |
| `[[bannedWords]]\nword = "skipped"\npaths = ["src/**"]\nnote = "x"` | `UnknownKey { key: "bannedWords.note" }` |
| `[[bannedWords]]\nword = ""\nnote = "x"` | `UnknownKey { key: "bannedWords.note" }` |
| `[[bannedWords]]\nword = "skipped"\npaths = ["src/**"]\n[[bannedWords]]\nword = ""\npaths = ["src/**"]` | list error |

### Requirement: Gate settings
`gates` SHALL be a table read into `Config.gates`, a `Gates` struct
deriving `Debug`, `Clone`, `Copy`, `PartialEq` and `Eq`, as TypeScript
merges `gates` over `DEFAULT_GATES_CONFIG`. Its one key is
`commitRetries`, read into `commit_retries: u64`, the catch-ups a run may
try after a `commit_failed` halt; it takes TypeScript's default 2, a named
constant in the config crate, when unset, so an absent `gates` table
gives `Gates::default()`. Unlike the shared integer rule, 0 is allowed: a
value that is not a TOML integer is `WrongType` with `an integer`, and a
negative one is `InvalidValue` with reason `must be a non-negative
integer`. Any other key in `gates`, TypeScript's other gates included, is
`UnknownKey`.

#### Scenario: Gate values
- **WHEN** `parse_config` reads the row's text
- **THEN** it returns the row's result, where a number is `Config.gates.commit_retries`:

| Text | Result |
|---|---|
| `` | 2 |
| `[gates]` | 2 |
| `[gates]\ncommitRetries = 0` | 0 |
| `[gates]\ncommitRetries = 5` | 5 |
| `[gates]\ncommitRetries = -1` | `InvalidValue { key: "gates.commitRetries", reason: "must be a non-negative integer" }` |
| `[gates]\ncommitRetries = "2"` | `WrongType { key: "gates.commitRetries", expected: "an integer" }` |
| `[gates]\ncommitRetries = 1.5` | `WrongType { key: "gates.commitRetries", expected: "an integer" }` |
| `[gates]\nbaselineVerify = "pnpm verify"` | `UnknownKey { key: "gates.baselineVerify" }` |
| `gates = 1` | `WrongType { key: "gates", expected: "a table" }` |

### Requirement: Planning settings
`planning` SHALL be a table read into `Config.planning`, a `Planning`
struct deriving `Debug`, `Clone` and `PartialEq`, as TypeScript's
`validatePlanningConfig` reads the sizes of the plan prompt's report and
its prices. Its keys, in reading order, are `disclosures`, `history`,
`record` and `prices`. The first three are each a table read into the
field of the same name:

- `disclosures` into `PlanningDisclosures` with `recentChanges` and
  `maxCharacters`, read into `recent_changes` and `max_characters`,
  by default 3 and 4000;
- `history` into `PlanningHistory` with `minimumTasks`, `recentTasks` and
  `maxCharacters`, read into `minimum_tasks`, `recent_tasks` and
  `max_characters`, by default 30, 100 and 1500;
- `record` into `PlanningRecord` with `minimumTasks`, `recentChanges` and
  `deadOutcomes`, read into `minimum_tasks`, `recent_changes` and
  `dead_outcomes`, by default 5, 20 and 10.

Each of the three structs SHALL derive `Debug`, `Clone`, `Copy`,
`PartialEq` and `Eq`, hold `u64` fields, and take each default from a
named constant in the config crate. Every value follows the shared
positive integer rule, named by its dotted key such as
`planning.history.minimumTasks`; a partial table keeps the other
defaults, and an absent `planning` table gives `Planning::default()`.

`prices` is a table read into `prices: BTreeMap<String, PlanningPrice>`,
empty by default, that maps a model id to its USD prices per million
tokens. `PlanningPrice` derives `Debug`, `Clone`, `Copy` and `PartialEq`,
is exported from the crate root, and holds the `f64` fields `input`,
`output`, `cache_read` and `cache_write`, read from the keys `input`,
`output`, `cacheRead` and `cacheWrite` in that order. All four are
required. A `prices` value that is not a table is `WrongType` with key
`planning.prices` and `a table`, and an entry that is not a table is
`WrongType` with key `planning.prices.<model>` and `a table`. A price that
is missing, is not a TOML integer or float, or is negative, infinite or
NaN is `InvalidValue` with key `planning.prices.<model>.<kind>` and reason
`must be a finite non-negative number`. Any other key in an entry is
`UnknownKey` with key `planning.prices.<model>.<key>`.

Any other key in `planning`, `idleGapMinutes` included, and any other key
in its three size tables, is `UnknownKey`.

#### Scenario: Planning values
- **WHEN** `parse_config` reads the row's text
- **THEN** `Config.planning` holds the row's values, and every value the row does not name is its default

| Text | Values |
|---|---|
| `` | every default |
| `[planning]` | every default |
| `[planning.disclosures]\nrecentChanges = 1\nmaxCharacters = 20` | `disclosures.recent_changes` 1, `disclosures.max_characters` 20 |
| `[planning.history]\nminimumTasks = 3\nrecentTasks = 2\nmaxCharacters = 148` | `history.minimum_tasks` 3, `history.recent_tasks` 2, `history.max_characters` 148 |
| `[planning.record]\nminimumTasks = 6\nrecentChanges = 2\ndeadOutcomes = 1` | `record.minimum_tasks` 6, `record.recent_changes` 2, `record.dead_outcomes` 1 |
| `[planning.record]\ndeadOutcomes = 1` | `record.dead_outcomes` 1 |

#### Scenario: Planning errors
- **WHEN** `parse_config` reads the row's text
- **THEN** it returns the row's error

| Text | Error |
|---|---|
| `[planning.disclosures]\nrecentChanges = 0` | `InvalidValue { key: "planning.disclosures.recentChanges", reason: "must be a positive integer" }` |
| `[planning.disclosures]\nmaxCharacters = -1` | `InvalidValue { key: "planning.disclosures.maxCharacters", reason: "must be a positive integer" }` |
| `[planning.history]\nminimumTasks = 0` | `InvalidValue { key: "planning.history.minimumTasks", reason: "must be a positive integer" }` |
| `[planning.history]\nrecentTasks = "2"` | `WrongType { key: "planning.history.recentTasks", expected: "an integer" }` |
| `[planning.history]\nmaxCharacters = 1.5` | `WrongType { key: "planning.history.maxCharacters", expected: "an integer" }` |
| `[planning.record]\nminimumTasks = 0` | `InvalidValue { key: "planning.record.minimumTasks", reason: "must be a positive integer" }` |
| `[planning.record]\nrecentChanges = -3` | `InvalidValue { key: "planning.record.recentChanges", reason: "must be a positive integer" }` |
| `[planning.record]\ndeadOutcomes = "10"` | `WrongType { key: "planning.record.deadOutcomes", expected: "an integer" }` |
| `[planning]\nidleGapMinutes = 10` | `UnknownKey { key: "planning.idleGapMinutes" }` |
| `[planning.record]\nmaxDeadOutcomes = 1` | `UnknownKey { key: "planning.record.maxDeadOutcomes" }` |
| `[planning]\nhistory = 1` | `WrongType { key: "planning.history", expected: "a table" }` |
| `planning = 1` | `WrongType { key: "planning", expected: "a table" }` |

#### Scenario: Planning prices
- **WHEN** `parse_config` reads the row's text
- **THEN** it returns the row's result

| Text | Result |
|---|---|
| `` | `planning.prices` is empty |
| `[planning.prices."claude-opus-5-5"]\ninput = 5\noutput = 25.5\ncacheRead = 0.5\ncacheWrite = 0` | `planning.prices` holds only `claude-opus-5-5` with `input` 5.0, `output` 25.5, `cache_read` 0.5 and `cache_write` 0.0 |
| `[planning.prices.m]\ninput = 1\noutput = 1\ncacheRead = 1\ncacheWrite = 1\n[planning.history]\nminimumTasks = 3` | `planning.prices` holds only `m`, every price 1.0, and `history.minimum_tasks` is 3 |
| `[planning]\nprices = 1` | `WrongType { key: "planning.prices", expected: "a table" }` |
| `[planning.prices]\nm = 1` | `WrongType { key: "planning.prices.m", expected: "a table" }` |
| `[planning.prices.m]\ninput = 1\noutput = 1\ncacheRead = 1` | `InvalidValue { key: "planning.prices.m.cacheWrite", reason: "must be a finite non-negative number" }` |
| `[planning.prices.m]\ninput = -1\noutput = 1\ncacheRead = 1\ncacheWrite = 1` | `InvalidValue { key: "planning.prices.m.input", reason: "must be a finite non-negative number" }` |
| `[planning.prices.m]\ninput = 1\noutput = "1"\ncacheRead = 1\ncacheWrite = 1` | `InvalidValue { key: "planning.prices.m.output", reason: "must be a finite non-negative number" }` |
| `[planning.prices.m]\ninput = 1\noutput = 1\ncacheRead = inf\ncacheWrite = 1` | `InvalidValue { key: "planning.prices.m.cacheRead", reason: "must be a finite non-negative number" }` |
| `[planning.prices.m]\ninput = 1\noutput = 1\ncacheRead = 1\ncacheWrite = 1\nreasoning = 1` | `UnknownKey { key: "planning.prices.m.reasoning" }` |

### Requirement: Harness settings
`agy`, `opencode`, `codex` and `claude` SHALL be tables read into
`Config.agy`, `Config.opencode`, `Config.codex` and `Config.claude`, with
the keys `doctor` reads, as TypeScript's config reads them. The model of
every harness stays in `executor.model`, so none of these tables holds a
`model` key. Each struct derives `Debug`, `Clone`, `Default`, `PartialEq`
and `Eq`, and an absent table gives its `Default`:

| Table | Struct | Keys, in reading order | Fields and defaults |
|---|---|---|---|
| `agy` | `AgyConfig` | `dangerouslySkipPermissions` | `dangerously_skip_permissions: bool`, `false` |
| `opencode` | `OpencodeConfig` | `bin`, `agent` | `bin: Option<String>`, `None`; `agent: String`, `osq-coder` |
| `codex` | `CodexConfig` | `bin` | `bin: Option<String>`, `None` |
| `claude` | `ClaudeConfig` | `bin`, `sandbox` | `bin: Option<String>`, `None`; `sandbox: bool`, `false` |

Strings follow the shared string rule and booleans the shared boolean
rule, each named by its dotted key such as `opencode.agent`. `osq-coder`,
TypeScript's default opencode agent, is a named constant in the config
crate. The four structs are exported from the crate root.

#### Scenario: Harness settings read
- **WHEN** `parse_config` reads each row's text
- **THEN** it returns the row's result:

| Text | Result |
|---|---|
| empty | `agy`, `opencode`, `codex` and `claude` equal their `Default`, whose `opencode.agent` is `osq-coder` |
| `[agy]\ndangerouslySkipPermissions = true` | `agy.dangerously_skip_permissions` is `true` |
| `[opencode]\nbin = " /opt/opencode "\nagent = "mine"` | `opencode` holds `bin` `/opt/opencode` and `agent` `mine` |
| `[opencode]\nbin = "oc"` | `opencode` holds `bin` `oc` and `agent` `osq-coder` |
| `[codex]\nbin = "/opt/codex"` | `codex.bin` is `/opt/codex` |
| `[claude]\nbin = "/opt/claude"\nsandbox = true` | `claude` holds `bin` `/opt/claude` and `sandbox` `true` |
| `[agy]\ndangerouslySkipPermissions = "yes"` | `WrongType` with key `agy.dangerouslySkipPermissions` and expected `a boolean` |
| `[agy]\nmodel = "m"` | `UnknownKey` with key `agy.model` |
| `[opencode]\nagent = " "` | `InvalidValue` with key `opencode.agent` and reason `must be a non-empty string` |
| `[opencode]\nbin = 1` | `WrongType` with key `opencode.bin` and expected `a string` |
| `[codex]\neffort = "high"` | `UnknownKey` with key `codex.effort` |
| `[claude]\nbin = ""` | `InvalidValue` with key `claude.bin` and reason `must be a non-empty string` |
| `[claude]\nsandbox = 1` | `WrongType` with key `claude.sandbox` and expected `a boolean` |
| `claude = "claude"` | `WrongType` with key `claude` and expected `a table` |
