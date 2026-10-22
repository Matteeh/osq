//! The `[limits]` table and its TypeScript defaults.

use toml::Table;

use crate::error::ConfigError;

use super::value;

/// The `limits` keys `osq.toml` may hold, in reading order.
const KEYS: &[&str] = &[
    "maxScopeFiles",
    "maxFeatureWrites",
    "maxContractTables",
    "maxAcceptanceLines",
    "importGraphDepth",
    "maxListedImporters",
    "maxRuleLength",
    "maxProjectRules",
    "cardOutputLines",
    "markerOutputLines",
    "markerLineChars",
    "maxListedLineEndings",
];

/// TypeScript's default for `limits.maxScopeFiles`.
const DEFAULT_MAX_SCOPE_FILES: u64 = 8;
/// TypeScript's default for `limits.maxFeatureWrites`.
const DEFAULT_MAX_FEATURE_WRITES: u64 = 2;
/// TypeScript's default for `limits.maxContractTables`.
const DEFAULT_MAX_CONTRACT_TABLES: u64 = 1;
/// TypeScript's default for `limits.maxAcceptanceLines`.
const DEFAULT_MAX_ACCEPTANCE_LINES: u64 = 7;
/// TypeScript's default for `limits.importGraphDepth`.
const DEFAULT_IMPORT_GRAPH_DEPTH: u64 = 2;
/// TypeScript's default for `limits.maxListedImporters`.
const DEFAULT_MAX_LISTED_IMPORTERS: u64 = 8;
/// TypeScript's default for `limits.maxRuleLength`.
const DEFAULT_MAX_RULE_LENGTH: u64 = 160;
/// TypeScript's default for `limits.maxProjectRules`.
const DEFAULT_MAX_PROJECT_RULES: u64 = 10;
/// TypeScript's default for `limits.cardOutputLines`.
const DEFAULT_CARD_OUTPUT_LINES: u64 = 20;
/// TypeScript's default for `limits.markerOutputLines`.
const DEFAULT_MARKER_OUTPUT_LINES: u64 = 40;
/// TypeScript's default for `limits.markerLineChars`.
const DEFAULT_MARKER_LINE_CHARS: u64 = 400;
/// TypeScript's default for `limits.maxListedLineEndings`.
const DEFAULT_MAX_LISTED_LINE_ENDINGS: u64 = 5;

/// Every lint limit osq applies, as `osq.toml`'s `[limits]` table holds them.
///
/// Implements: rust-config/lint-limits
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    /// The most files a task's scope may name.
    pub max_scope_files: u64,
    /// The most writes one task may make to a feature.
    pub max_feature_writes: u64,
    /// The most tables a contract may hold.
    pub max_contract_tables: u64,
    /// The most acceptance lines a task may hold.
    pub max_acceptance_lines: u64,
    /// The import levels the frozen-test reach warning follows.
    pub import_graph_depth: u64,
    /// The most importers one import-graph warning lists.
    pub max_listed_importers: u64,
    /// The most characters an accepted rule may have.
    pub max_rule_length: u64,
    /// The most system-wide rules the project rules block may hold.
    pub max_project_rules: u64,
    /// The most marker lines a dispatch halt card shows.
    pub card_output_lines: u64,
    /// The most output lines a `.run` marker keeps.
    pub marker_output_lines: u64,
    /// The most characters a marker keeps of one output line.
    pub marker_line_chars: u64,
    /// The most line-ending files the warning names.
    pub max_listed_line_endings: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_scope_files: DEFAULT_MAX_SCOPE_FILES,
            max_feature_writes: DEFAULT_MAX_FEATURE_WRITES,
            max_contract_tables: DEFAULT_MAX_CONTRACT_TABLES,
            max_acceptance_lines: DEFAULT_MAX_ACCEPTANCE_LINES,
            import_graph_depth: DEFAULT_IMPORT_GRAPH_DEPTH,
            max_listed_importers: DEFAULT_MAX_LISTED_IMPORTERS,
            max_rule_length: DEFAULT_MAX_RULE_LENGTH,
            max_project_rules: DEFAULT_MAX_PROJECT_RULES,
            card_output_lines: DEFAULT_CARD_OUTPUT_LINES,
            marker_output_lines: DEFAULT_MARKER_OUTPUT_LINES,
            marker_line_chars: DEFAULT_MARKER_LINE_CHARS,
            max_listed_line_endings: DEFAULT_MAX_LISTED_LINE_ENDINGS,
        }
    }
}

/// Reads `osq.toml`'s `[limits]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/lint-limits
pub(crate) fn read_limits(table: &Table) -> Result<Limits, ConfigError> {
    value::check_keys(table, KEYS, "limits")?;
    let defaults = Limits::default();
    Ok(Limits {
        max_scope_files: limit(table, "limits.maxScopeFiles", defaults.max_scope_files)?,
        max_feature_writes: limit(
            table,
            "limits.maxFeatureWrites",
            defaults.max_feature_writes,
        )?,
        max_contract_tables: limit(
            table,
            "limits.maxContractTables",
            defaults.max_contract_tables,
        )?,
        max_acceptance_lines: limit(
            table,
            "limits.maxAcceptanceLines",
            defaults.max_acceptance_lines,
        )?,
        import_graph_depth: limit(
            table,
            "limits.importGraphDepth",
            defaults.import_graph_depth,
        )?,
        max_listed_importers: limit(
            table,
            "limits.maxListedImporters",
            defaults.max_listed_importers,
        )?,
        max_rule_length: limit(table, "limits.maxRuleLength", defaults.max_rule_length)?,
        max_project_rules: limit(table, "limits.maxProjectRules", defaults.max_project_rules)?,
        card_output_lines: limit(table, "limits.cardOutputLines", defaults.card_output_lines)?,
        marker_output_lines: limit(
            table,
            "limits.markerOutputLines",
            defaults.marker_output_lines,
        )?,
        marker_line_chars: limit(table, "limits.markerLineChars", defaults.marker_line_chars)?,
        max_listed_line_endings: limit(
            table,
            "limits.maxListedLineEndings",
            defaults.max_listed_line_endings,
        )?,
    })
}

/// Reads one `[limits]` key, falling back to `default`.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` or `ConfigError::InvalidValue` per the
/// shared integer rule.
///
/// Implements: rust-config/lint-limits
fn limit(table: &Table, path: &str, default: u64) -> Result<u64, ConfigError> {
    value::positive_integer(table, path).map(|value| value.unwrap_or(default))
}
