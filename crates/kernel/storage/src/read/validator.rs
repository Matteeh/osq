//! Picking the failing validator run of the archived changes.
//!
//! The rule moved here from the inbox so `inbox` and `status` read it from one
//! place, as TypeScript's `readValidatorFailing` decides it.
//!
//! Implements: rust-storage/validator-failing-record

use osq_core::Event;
use osq_core::event::ValidatorOutcome;

use super::text::timestamp_ms;
use super::{ChangeSnapshot, Location};

/// The latest failing validator run across the archived changes.
///
/// Implements: rust-storage/validator-failing-record
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ValidatorFailing {
    /// The change folder the run belongs to.
    pub change: String,
    /// The run's outcome.
    pub outcome: ValidatorOutcome,
    /// The runs from the end in a row with a failing outcome.
    pub runs: usize,
    /// The run's first non-blank output line, or its outcome's text.
    pub error: String,
}

/// Picks the latest failing validator run of the archived changes, if any.
///
/// Implements: rust-storage/validator-failing-record
#[must_use]
pub fn validator_failing(snapshots: &[ChangeSnapshot]) -> Option<ValidatorFailing> {
    let mut runs = Vec::new();
    for snapshot in snapshots {
        if snapshot.location != Location::Archived {
            continue;
        }
        let Some(facts) = &snapshot.facts else {
            continue;
        };
        for event in &facts.table_events {
            let Event::ValidatorRan(data) = &event.event else {
                continue;
            };
            if data.outcome == ValidatorOutcome::NotRun {
                continue;
            }
            runs.push(Run {
                change: &snapshot.folder,
                time: timestamp_ms(&event.timestamp).unwrap_or(0),
                outcome: data.outcome,
                output: data.output.as_deref(),
            });
        }
    }
    runs.sort_by_key(|run| run.time);
    let latest = runs.last()?;
    if !failing(latest.outcome) {
        return None;
    }
    let count = runs
        .iter()
        .rev()
        .take_while(|run| failing(run.outcome))
        .count();
    let error = first_line(latest.output).unwrap_or_else(|| latest.outcome.as_str().to_owned());
    Some(ValidatorFailing {
        change: latest.change.to_owned(),
        outcome: latest.outcome,
        runs: count,
        error,
    })
}

/// One validator run of an archived change.
struct Run<'a> {
    /// The change folder the run belongs to.
    change: &'a str,
    /// The run's epoch milliseconds, 0 when its timestamp does not read.
    time: i64,
    /// The run's outcome.
    outcome: ValidatorOutcome,
    /// The run's output, when it reported one.
    output: Option<&'a str>,
}

/// Whether an outcome keeps the failing line up.
fn failing(outcome: ValidatorOutcome) -> bool {
    matches!(
        outcome,
        ValidatorOutcome::Failed | ValidatorOutcome::TimedOut | ValidatorOutcome::Unreadable
    )
}

/// The first non-blank line of an output, trimmed.
fn first_line(output: Option<&str>) -> Option<String> {
    output?
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}
