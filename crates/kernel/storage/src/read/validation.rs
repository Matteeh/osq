//! Reading the latest validator run of one change folder.
//!
//! Implements: rust-storage/latest-validation

use std::fs;
use std::path::Path;

use osq_kernel_specs::js_trim;
use serde_json::Value;

use super::task_history::stream;

/// The latest readable validator run of one change folder.
///
/// Implements: rust-storage/latest-validation
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ValidationRun {
    /// The run's trimmed outcome.
    pub outcome: String,
    /// The findings a validated run reported.
    pub findings: u64,
}

/// Reads the latest readable `validator_ran` event in a folder's change stream.
///
/// A missing file, or one with no readable run, gives `None`.
///
/// Implements: rust-storage/latest-validation
#[must_use]
pub fn read_latest_validation(folder: &Path) -> Option<ValidationRun> {
    let path = folder.join(".run").join("events").join("change.jsonl");
    let content = fs::read_to_string(path).ok()?;
    latest(&content)
}

/// The latest readable run among a stream's lines, later lines winning ties.
fn latest(content: &str) -> Option<ValidationRun> {
    let mut latest: Option<(i64, ValidationRun)> = None;
    for event in stream::parse(content) {
        let Some((time, run)) = run_of(&event) else {
            continue;
        };
        if latest.as_ref().is_none_or(|(seen, _)| time >= *seen) {
            latest = Some((time, run));
        }
    }
    latest.map(|(_, run)| run)
}

/// One event's timestamp and run, or `None` when it is not a readable run.
fn run_of(event: &stream::Event) -> Option<(i64, ValidationRun)> {
    if event.kind() != Some("validator_ran") {
        return None;
    }
    let time = event.timestamp_ms()?;
    let outcome = js_trim(event.text("outcome")?);
    if outcome.is_empty() {
        return None;
    }
    let findings = if outcome == "validated" {
        event
            .raw("findings")
            .and_then(Value::as_array)
            .map_or(0, |items| u64::try_from(items.len()).unwrap_or(u64::MAX))
    } else {
        0
    };
    Some((
        time,
        ValidationRun {
            outcome: outcome.to_owned(),
            findings,
        },
    ))
}
