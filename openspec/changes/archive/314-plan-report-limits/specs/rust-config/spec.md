## ADDED Requirements

### Requirement: Planning settings
`planning` SHALL be a table read into `Config.planning`, a `Planning`
struct deriving `Debug`, `Clone`, `Copy`, `PartialEq` and `Eq`, as
TypeScript's `validatePlanningConfig` reads the sizes of the plan
prompt's report. Its keys, in reading order, are `disclosures`, `history`
and `record`, each a table read into the field of the same name:

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
Any other key in `planning`, `idleGapMinutes` and `prices` included, and
any other key in its three tables, is `UnknownKey`.

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
`planner`, `validator`, `pi`, `limits`, `gates`, `planning` and
`bannedWords` into `Config`, whose fields are `max_concurrency`,
`timeouts`, `vcs`, `executor`, `planner`, `validator`, `pi`, `limits`,
`gates`, `planning` and `banned_words`, as the requirements of each key
say. `Config` SHALL derive
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
- **WHEN** `parse_config` reads `[server]\nport = 4174\n[limits]\nmaxScopeFiles = 9`
- **THEN** it returns `ConfigError::UnknownKey` with `key` `server`
