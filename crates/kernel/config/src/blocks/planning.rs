//! The `[planning]` table and its TypeScript defaults.

use toml::Table;

use crate::error::ConfigError;

use super::value;

/// The `planning` keys `osq.toml` may hold, in reading order.
const KEYS: &[&str] = &["disclosures", "history", "record"];

/// The `planning.disclosures` keys `osq.toml` may hold, in reading order.
const DISCLOSURE_KEYS: &[&str] = &["recentChanges", "maxCharacters"];

/// The `planning.history` keys `osq.toml` may hold, in reading order.
const HISTORY_KEYS: &[&str] = &["minimumTasks", "recentTasks", "maxCharacters"];

/// The `planning.record` keys `osq.toml` may hold, in reading order.
const RECORD_KEYS: &[&str] = &["minimumTasks", "recentChanges", "deadOutcomes"];

/// TypeScript's default for `planning.disclosures.recentChanges`.
const DEFAULT_DISCLOSURES_RECENT_CHANGES: u64 = 3;
/// TypeScript's default for `planning.disclosures.maxCharacters`.
const DEFAULT_DISCLOSURES_MAX_CHARACTERS: u64 = 4000;
/// TypeScript's default for `planning.history.minimumTasks`.
const DEFAULT_HISTORY_MINIMUM_TASKS: u64 = 30;
/// TypeScript's default for `planning.history.recentTasks`.
const DEFAULT_HISTORY_RECENT_TASKS: u64 = 100;
/// TypeScript's default for `planning.history.maxCharacters`.
const DEFAULT_HISTORY_MAX_CHARACTERS: u64 = 1500;
/// TypeScript's default for `planning.record.minimumTasks`.
const DEFAULT_RECORD_MINIMUM_TASKS: u64 = 5;
/// TypeScript's default for `planning.record.recentChanges`.
const DEFAULT_RECORD_RECENT_CHANGES: u64 = 20;
/// TypeScript's default for `planning.record.deadOutcomes`.
const DEFAULT_RECORD_DEAD_OUTCOMES: u64 = 10;

/// The plan report's measurement settings, as `[planning]` holds them.
///
/// Implements: rust-config/planning-settings
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Planning {
    /// The executor disclosures the plan prompt quotes.
    pub disclosures: PlanningDisclosures,
    /// The counted history hints the plan prompt prints.
    pub history: PlanningHistory,
    /// The shared repository record the plan prompt prints.
    pub record: PlanningRecord,
}

/// The bounds on the executor disclosures quoted in the plan prompt.
///
/// Implements: rust-config/planning-settings
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlanningDisclosures {
    /// How many of the newest archived changes may contribute disclosures.
    pub recent_changes: u64,
    /// Total characters of quoted disclosure entries.
    pub max_characters: u64,
}

impl Default for PlanningDisclosures {
    fn default() -> Self {
        Self {
            recent_changes: DEFAULT_DISCLOSURES_RECENT_CHANGES,
            max_characters: DEFAULT_DISCLOSURES_MAX_CHARACTERS,
        }
    }
}

/// The bounds on the counted `## What history says` lines in the plan prompt.
///
/// Implements: rust-config/planning-settings
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlanningHistory {
    /// Tasks that ran before the section appears at all.
    pub minimum_tasks: u64,
    /// Most recent of those tasks the counts cover.
    pub recent_tasks: u64,
    /// Most characters the section body holds.
    pub max_characters: u64,
}

impl Default for PlanningHistory {
    fn default() -> Self {
        Self {
            minimum_tasks: DEFAULT_HISTORY_MINIMUM_TASKS,
            recent_tasks: DEFAULT_HISTORY_RECENT_TASKS,
            max_characters: DEFAULT_HISTORY_MAX_CHARACTERS,
        }
    }
}

/// The bounds on the shared repository record in the plan prompt.
///
/// Implements: rust-config/planning-settings
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlanningRecord {
    /// Fewest measured tasks before the record prints its lines.
    pub minimum_tasks: u64,
    /// Most archived changes the record's window holds.
    pub recent_changes: u64,
    /// Most dead outcome rows the record keeps.
    pub dead_outcomes: u64,
}

impl Default for PlanningRecord {
    fn default() -> Self {
        Self {
            minimum_tasks: DEFAULT_RECORD_MINIMUM_TASKS,
            recent_changes: DEFAULT_RECORD_RECENT_CHANGES,
            dead_outcomes: DEFAULT_RECORD_DEAD_OUTCOMES,
        }
    }
}

/// Reads `osq.toml`'s `[planning]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/planning-settings
pub(crate) fn read_planning(table: &Table) -> Result<Planning, ConfigError> {
    value::check_keys(table, KEYS, "planning")?;
    let disclosures = match value::table(table, "planning.disclosures")? {
        Some(inner) => read_disclosures(inner)?,
        None => PlanningDisclosures::default(),
    };
    let history = match value::table(table, "planning.history")? {
        Some(inner) => read_history(inner)?,
        None => PlanningHistory::default(),
    };
    let record = match value::table(table, "planning.record")? {
        Some(inner) => read_record(inner)?,
        None => PlanningRecord::default(),
    };
    Ok(Planning {
        disclosures,
        history,
        record,
    })
}

/// Reads `osq.toml`'s `[planning.disclosures]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/planning-settings
fn read_disclosures(table: &Table) -> Result<PlanningDisclosures, ConfigError> {
    let defaults = PlanningDisclosures::default();
    value::check_keys(table, DISCLOSURE_KEYS, "planning.disclosures")?;
    Ok(PlanningDisclosures {
        recent_changes: value::positive_integer(table, "planning.disclosures.recentChanges")?
            .unwrap_or(defaults.recent_changes),
        max_characters: value::positive_integer(table, "planning.disclosures.maxCharacters")?
            .unwrap_or(defaults.max_characters),
    })
}

/// Reads `osq.toml`'s `[planning.history]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/planning-settings
fn read_history(table: &Table) -> Result<PlanningHistory, ConfigError> {
    let defaults = PlanningHistory::default();
    value::check_keys(table, HISTORY_KEYS, "planning.history")?;
    Ok(PlanningHistory {
        minimum_tasks: value::positive_integer(table, "planning.history.minimumTasks")?
            .unwrap_or(defaults.minimum_tasks),
        recent_tasks: value::positive_integer(table, "planning.history.recentTasks")?
            .unwrap_or(defaults.recent_tasks),
        max_characters: value::positive_integer(table, "planning.history.maxCharacters")?
            .unwrap_or(defaults.max_characters),
    })
}

/// Reads `osq.toml`'s `[planning.record]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/planning-settings
fn read_record(table: &Table) -> Result<PlanningRecord, ConfigError> {
    let defaults = PlanningRecord::default();
    value::check_keys(table, RECORD_KEYS, "planning.record")?;
    Ok(PlanningRecord {
        minimum_tasks: value::positive_integer(table, "planning.record.minimumTasks")?
            .unwrap_or(defaults.minimum_tasks),
        recent_changes: value::positive_integer(table, "planning.record.recentChanges")?
            .unwrap_or(defaults.recent_changes),
        dead_outcomes: value::positive_integer(table, "planning.record.deadOutcomes")?
            .unwrap_or(defaults.dead_outcomes),
    })
}
