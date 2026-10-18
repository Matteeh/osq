//! Checking a delta spec's entries against the living spec it targets (ADR 026).

use super::delta_scan::{DeltaOutline, scan_delta};
use super::finding::{FindingCode, SpecFinding};
use super::sort_findings;
use crate::markdown::{LivingSpec, RenameSide};
use std::collections::HashSet;

/// Checks the delta entries that name a living requirement.
///
/// Returns an `unknown-requirement` finding for each MODIFIED requirement,
/// REMOVED name and RENAMED FROM name the living spec has no requirement for.
/// A MODIFIED name that is the TO of one of the delta's renames counts as
/// known, and with no living spec no requirement is known.
///
/// Implements: rust-specs/delta-targets
#[must_use]
pub fn check_delta_targets(
    file: &str,
    text: &str,
    living: Option<&LivingSpec>,
) -> Vec<SpecFinding> {
    let scan = scan_delta(text);
    let known: HashSet<&str> = living
        .map(|spec| {
            spec.requirements
                .iter()
                .map(|requirement| requirement.name.as_str())
                .collect()
        })
        .unwrap_or_default();
    let renamed: HashSet<&str> = scan
        .renames
        .iter()
        .filter(|rename| rename.side == RenameSide::To)
        .map(|rename| rename.name.as_str())
        .collect();

    let mut findings = Vec::new();
    for (line, name) in modified_names(&scan) {
        if !known.contains(name.as_str()) && !renamed.contains(name.as_str()) {
            findings.push(unknown(file, line, &name));
        }
    }
    for removed in &scan.removed {
        if !known.contains(removed.name.as_str()) {
            findings.push(unknown(file, removed.line, &removed.name));
        }
    }
    for rename in &scan.renames {
        if rename.side == RenameSide::From && !known.contains(rename.name.as_str()) {
            findings.push(unknown(file, rename.line, &rename.name));
        }
    }
    sort_findings(&mut findings);
    findings
}

/// The line and name of every MODIFIED requirement.
fn modified_names(scan: &DeltaOutline) -> Vec<(usize, String)> {
    scan.requirements
        .iter()
        .filter(|requirement| {
            requirement
                .section
                .and_then(|index| scan.sections.get(index))
                .is_some_and(|section| section.title.eq_ignore_ascii_case("MODIFIED Requirements"))
        })
        .map(|requirement| (requirement.line, requirement.requirement.name.clone()))
        .collect()
}

/// One unknown-requirement finding for `name` at `line`.
fn unknown(file: &str, line: usize, name: &str) -> SpecFinding {
    SpecFinding::new(
        FindingCode::UnknownRequirement,
        file,
        line,
        Some(name.to_string()),
        format!("the delta names `{name}`, which the living spec has no requirement for"),
    )
}
