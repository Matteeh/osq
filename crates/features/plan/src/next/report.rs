//! The plan prompt's sections after `## Brief`, read from the archive.
//!
//! One function reads the history and the ownership; a pure builder turns the
//! storage values into the section text (ADR 023).

use std::cmp::Ordering;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::{Planning, load_config};
use osq_kernel_specs::CapabilityOwnership;
use osq_kernel_storage::{ChangeSnapshot, ManualEdit, task_outcomes};

/// The prompt's recent executor disclosures section.
mod disclosures;
/// The prompt's history hints section.
mod hints;
/// The prompt's open manual edits section.
mod manual;
/// The prompt's repository record section.
mod record;

/// Reads the archive, the manual edits and the living ownership, then builds
/// the appended text.
///
/// Implements: rust-plan/plan-prompt
pub(super) fn sections(root: &Path) -> Result<String, FeatureError> {
    let config =
        load_config(root).map_err(|error| FeatureError::failed("plan", error.to_string()))?;
    let snapshots = osq_kernel_storage::read_history(root).map_err(|error| {
        FeatureError::failed("plan", format!("Cannot read the archive: {error}"))
    })?;
    let edits = osq_kernel_storage::read_manual_edits(root);
    let specs = root.join("openspec").join("specs");
    let ownerships = osq_kernel_specs::read_capability_ownership(&specs);
    Ok(build(&snapshots, &ownerships, &edits, &config.planning))
}

/// Builds the section text after `## Brief` from the snapshots, ownership,
/// manual edits and the plan report's configured sizes.
///
/// Implements: rust-plan/plan-prompt
fn build(
    snapshots: &[ChangeSnapshot],
    ownerships: &[CapabilityOwnership],
    edits: &[ManualEdit],
    planning: &Planning,
) -> String {
    let record = planning.record;
    let mut sections = vec![format!(
        "## This repository's record\n\n{}",
        record::body(
            snapshots,
            to_size(record.minimum_tasks),
            to_size(record.recent_changes),
            to_size(record.dead_outcomes),
        )
    )];
    let history = planning.history;
    let rows = task_outcomes(snapshots, ownerships);
    if let Some(hints) = hints::body(
        &rows,
        to_size(history.minimum_tasks),
        to_size(history.recent_tasks),
        to_size(history.max_characters),
    ) {
        sections.push(format!("## What history says\n\n{hints}"));
    }
    let disclosures = planning.disclosures;
    if let Some(body) = disclosures::body(
        snapshots,
        to_size(disclosures.recent_changes),
        to_size(disclosures.max_characters),
    ) {
        sections.push(format!("## Recent executor disclosures\n\n{body}"));
    }
    if let Some(manual) = manual::body(snapshots, edits) {
        sections.push(format!("## Manual edits\n\n{manual}"));
    }
    sections.join("\n\n")
}

/// The configured size as a `usize`, saturating when it cannot be one.
fn to_size(value: u64) -> usize {
    usize::try_from(value).unwrap_or(usize::MAX)
}

/// The digits a name leads with, or none when it leads with no digit.
fn leading_number(name: &str) -> Option<u128> {
    name.chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>()
        .parse()
        .ok()
}

/// Orders two names by leading number first, then by their text.
fn compare_numeric_prefix(left: &str, right: &str) -> Ordering {
    match (leading_number(left), leading_number(right)) {
        (Some(a), Some(b)) => a.cmp(&b).then_with(|| left.cmp(right)),
        _ => left.cmp(right),
    }
}
