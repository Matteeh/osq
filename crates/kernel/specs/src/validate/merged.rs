//! Validating the merged result of a change's delta specs (ADR 026).

use super::finding::SpecFinding;
use super::living::validate_living_spec;
use super::outline;
use super::sort_findings;
use crate::merge::{MergeChangeError, merge_change};
use crate::validate::change::read_text;
use std::path::Path;

/// Validates the merged result of a change's delta specs.
///
/// Runs `validate_living_spec` on each merged text `merge_change` gives that is
/// not none, drops each finding the living spec already has, and points the kept
/// findings at the delta and its requirement header.
///
/// # Errors
///
/// Returns `merge_change`'s error when there is one.
///
/// Implements: rust-specs/merged-spec-validation
pub fn validate_merged_change(
    change_dir: &Path,
    specs_dir: &Path,
) -> Result<Vec<SpecFinding>, MergeChangeError> {
    let merged = merge_change(change_dir, specs_dir)?;
    let mut findings = Vec::new();
    for spec in &merged {
        let Some(text) = spec.text.as_deref() else {
            continue;
        };
        let file = spec.delta.display().to_string();
        let living = living_findings(specs_dir, &spec.capability)?;
        let delta_text = read_text(&spec.delta).map_err(MergeChangeError::Read)?;
        let delta_outline = outline::scan(&delta_text);
        let mut kept = validate_living_spec(&file, text);
        kept.retain(|finding| !living.iter().any(|other| same(other, finding)));
        for finding in &mut kept {
            finding.line = header_line(&delta_outline, finding.requirement.as_deref());
        }
        sort_findings(&mut kept);
        findings.extend(kept);
    }
    Ok(findings)
}

/// The findings of the living spec at `specs_dir/<capability>/spec.md`, or no finding.
fn living_findings(
    specs_dir: &Path,
    capability: &str,
) -> Result<Vec<SpecFinding>, MergeChangeError> {
    let path = specs_dir.join(capability).join("spec.md");
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let text = read_text(&path).map_err(MergeChangeError::Read)?;
    Ok(validate_living_spec(&path.display().to_string(), &text))
}

/// True when two findings share a code and a requirement, absent ones included.
fn same(left: &SpecFinding, right: &SpecFinding) -> bool {
    left.code == right.code && left.requirement == right.requirement
}

/// The line of the delta's first header naming `requirement`, or 1.
fn header_line(outline: &outline::Outline, requirement: Option<&str>) -> usize {
    let Some(name) = requirement else {
        return 1;
    };
    outline
        .requirements
        .iter()
        .find(|entry| entry.requirement.name == name)
        .map_or(1, |entry| entry.line)
}
