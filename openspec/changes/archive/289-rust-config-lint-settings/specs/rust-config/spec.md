## ADDED Requirements

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
`planner`, `validator`, `pi`, `limits` and `bannedWords` into `Config`,
whose fields are `max_concurrency`, `timeouts`, `vcs`, `executor`,
`planner`, `validator`, `pi`, `limits` and `banned_words`, as the
requirements of each key say. `Config` SHALL derive
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
