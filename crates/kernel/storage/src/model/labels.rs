//! Reading the trial label files and filling the labelled tables' columns.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use rusqlite::{Connection, params};
use serde_json::Value;

use super::error::ReadModelError;

/// The ids labelled true or false in each trial labels file.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TrialLabels {
    /// The `openspec/trials/validator.json` labels.
    pub validator: BTreeMap<String, bool>,
    /// The `openspec/trials/traceability.json` labels.
    pub traceability: BTreeMap<String, bool>,
}

/// Reads both trial label files under the project root.
///
/// A missing or unreadable file holds no labels.
///
/// Implements: rust-storage/trial-labels
///
/// # Errors
///
/// Returns [`ReadModelError::Labels`] when a file is not a JSON object whose
/// values are all true or false.
pub fn read_trial_labels(project_root: &Path) -> Result<TrialLabels, ReadModelError> {
    Ok(TrialLabels {
        validator: read_label_file(project_root, "validator")?,
        traceability: read_label_file(project_root, "traceability")?,
    })
}

/// Fills the label columns of `validator_findings`, `mutation_survivors` and
/// `link_findings` after their rows are in.
///
/// Implements: rust-storage/trial-labels
///
/// # Errors
///
/// Returns an error when the database cannot be opened or updated.
pub(super) fn apply_labels(db_path: &Path, labels: &TrialLabels) -> Result<(), ReadModelError> {
    let connection = Connection::open(db_path)?;
    apply_label_map(
        &connection,
        "UPDATE validator_findings SET label = ? WHERE id = ?",
        &labels.validator,
    )?;
    apply_label_map(
        &connection,
        "UPDATE mutation_survivors SET label = ? WHERE id = ?",
        &labels.traceability,
    )?;
    apply_label_map(
        &connection,
        "UPDATE link_findings SET label = ? WHERE id = ?",
        &labels.traceability,
    )?;
    Ok(())
}

/// One labels file as a map, or an empty map when it cannot be read.
fn read_label_file(
    project_root: &Path,
    kind: &str,
) -> Result<BTreeMap<String, bool>, ReadModelError> {
    let path = project_root
        .join("openspec")
        .join("trials")
        .join(format!("{kind}.json"));
    let Ok(text) = fs::read_to_string(path) else {
        return Ok(BTreeMap::new());
    };
    let value: Value = serde_json::from_str(&text).map_err(|_| malformed(kind))?;
    let object = value.as_object().ok_or_else(|| malformed(kind))?;
    object
        .iter()
        .map(|(id, label)| {
            label
                .as_bool()
                .map(|value| (id.clone(), value))
                .ok_or_else(|| malformed(kind))
        })
        .collect()
}

/// The error a malformed label file raises, naming the file.
fn malformed(kind: &str) -> ReadModelError {
    ReadModelError::Labels(format!(
        "openspec/trials/{kind}.json must be a JSON object of true or false labels"
    ))
}

/// Runs one label update for every labelled id.
fn apply_label_map(
    connection: &Connection,
    sql: &str,
    labels: &BTreeMap<String, bool>,
) -> Result<(), rusqlite::Error> {
    let mut statement = connection.prepare(sql)?;
    for (id, label) in labels {
        statement.execute(params![super::rows::flag(*label), id])?;
    }
    Ok(())
}
