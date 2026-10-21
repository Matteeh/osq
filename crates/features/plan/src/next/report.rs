//! The plan prompt's sections after `## Brief`, read from the archive.
//!
//! One function reads the history and the ownership; a pure builder turns the
//! storage values into the section text (ADR 023).

use std::cmp::Ordering;
use std::path::Path;

use osq_core::FeatureError;
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
    let snapshots = osq_kernel_storage::read_history(root).map_err(|error| {
        FeatureError::failed("plan", format!("Cannot read the archive: {error}"))
    })?;
    let edits = osq_kernel_storage::read_manual_edits(root);
    let specs = root.join("openspec").join("specs");
    let ownerships = osq_kernel_specs::read_capability_ownership(&specs);
    Ok(build(&snapshots, &ownerships, &edits))
}

/// Builds the section text after `## Brief` from the snapshots, ownership and
/// manual edits.
///
/// Implements: rust-plan/plan-prompt
fn build(
    snapshots: &[ChangeSnapshot],
    ownerships: &[CapabilityOwnership],
    edits: &[ManualEdit],
) -> String {
    let mut sections = vec![format!(
        "## This repository's record\n\n{}",
        record::body(snapshots)
    )];
    let rows = task_outcomes(snapshots, ownerships);
    if let Some(history) = hints::body(&rows) {
        sections.push(format!("## What history says\n\n{history}"));
    }
    if let Some(disclosures) = disclosures::body(snapshots) {
        sections.push(format!("## Recent executor disclosures\n\n{disclosures}"));
    }
    if let Some(manual) = manual::body(snapshots, edits) {
        sections.push(format!("## Manual edits\n\n{manual}"));
    }
    sections.join("\n\n")
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
