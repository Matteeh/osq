## ADDED Requirements

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

## MODIFIED Requirements

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
