//! Validating a change folder's delta specs against the living specs (ADR 026).

use super::delta::validate_delta;
use super::delta_targets::check_delta_targets;
use super::finding::{FindingCode, SpecFinding};
use super::sort_findings;
use crate::markdown::{LivingSpec, parse_living_spec};
use crate::read::SpecsError;
use std::path::{Path, PathBuf};

/// Validates every delta spec of a change against the living specs.
///
/// Reads the `spec.md` of each folder directly under `change_dir/specs`, in
/// byte order of their names, and checks it against the living spec at
/// `specs_dir/<folder>/spec.md`, or none when that is not a file. A change
/// with no delta spec gives one `change-without-delta` finding.
///
/// # Errors
///
/// Returns a `SpecsError` when a delta or living spec cannot be read or is not
/// UTF-8.
///
/// Implements: rust-specs/delta-targets
pub fn validate_change(
    change_dir: &Path,
    specs_dir: &Path,
) -> Result<Vec<SpecFinding>, SpecsError> {
    let mut findings = Vec::new();
    let mut found = false;
    for folder in folders(&change_dir.join("specs")) {
        let path = folder.join("spec.md");
        if !path.is_file() {
            continue;
        }
        found = true;
        let file = path.display().to_string();
        let text = read_text(&path)?;
        let living = living_for(specs_dir, &folder)?;
        let mut delta = validate_delta(&file, &text);
        delta.extend(check_delta_targets(&file, &text, living.as_ref()));
        sort_findings(&mut delta);
        findings.extend(delta);
    }
    if !found {
        let file = change_dir.join("proposal.md").display().to_string();
        findings.push(SpecFinding::new(
            FindingCode::ChangeWithoutDelta,
            &file,
            1,
            None,
            "the change holds no delta spec".to_string(),
        ));
    }
    Ok(findings)
}

/// Reads the living spec for one delta folder, or none when it has no `spec.md`.
fn living_for(specs_dir: &Path, folder: &Path) -> Result<Option<LivingSpec>, SpecsError> {
    let Some(name) = folder.file_name() else {
        return Ok(None);
    };
    let path = specs_dir.join(name).join("spec.md");
    if !path.is_file() {
        return Ok(None);
    }
    Ok(Some(parse_living_spec(&read_text(&path)?)))
}

/// The folders directly under `specs_dir`, in byte order of their names.
pub(crate) fn folders(specs_dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(specs_dir) else {
        return Vec::new();
    };
    let mut folders: Vec<PathBuf> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .collect();
    folders.sort_by(|left, right| left.file_name().cmp(&right.file_name()));
    folders
}

/// Reads one file as UTF-8 text, naming its path when it cannot.
pub(crate) fn read_text(path: &Path) -> Result<String, SpecsError> {
    std::fs::read_to_string(path).map_err(|error| SpecsError::Read {
        path: path.to_path_buf(),
        message: error.to_string(),
    })
}
