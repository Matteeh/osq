## ADDED Requirements

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
`planner`, `validator`, `pi`, `limits`, `gates` and `bannedWords` into
`Config`, whose fields are `max_concurrency`, `timeouts`, `vcs`,
`executor`, `planner`, `validator`, `pi`, `limits`, `gates` and
`banned_words`, as the requirements of each key say. `Config` SHALL derive
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
