## ADDED Requirements

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
`planner`, `validator` and `pi` into `Config`, whose fields are
`max_concurrency`, `timeouts`, `vcs`, `executor`, `planner`,
`validator` and `pi`, as the requirements of each key say. `Config` SHALL derive
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
