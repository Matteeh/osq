//! Validating living capability specs against the rules of ADR 026.

use super::finding::{FindingCode, SpecFinding};
use super::outline::{self, RequirementOutline};
use super::requirement::requirement_findings;
use crate::markdown::parse_living_spec;
use crate::read::SpecsError;
use std::path::{Path, PathBuf};

/// Validates one living spec and returns its findings.
///
/// Implements: rust-specs/living-spec-validation
#[must_use]
pub fn validate_living_spec(file: &str, text: &str) -> Vec<SpecFinding> {
    let spec = parse_living_spec(text);
    let outline = outline::scan(text);
    let section = outline
        .headings
        .iter()
        .position(|heading| heading.title.eq_ignore_ascii_case("Requirements"));
    let (inside, outside): (Vec<&RequirementOutline>, Vec<&RequirementOutline>) = outline
        .requirements
        .iter()
        .partition(|requirement| in_section(requirement, section));

    let mut findings = Vec::new();
    if spec.purpose.is_empty() {
        findings.push(SpecFinding::new(
            FindingCode::MissingPurpose,
            file,
            1,
            None,
            "the spec has no purpose".to_string(),
        ));
    }
    if spec.requirements.is_empty() {
        findings.push(SpecFinding::new(
            FindingCode::MissingRequirements,
            file,
            1,
            None,
            "the spec has no requirement".to_string(),
        ));
    }
    for requirement in &outside {
        let name = &requirement.requirement.name;
        findings.push(SpecFinding::new(
            FindingCode::RequirementOutsideSection,
            file,
            requirement.line,
            Some(name.clone()),
            format!("requirement `{name}` sits outside the Requirements section"),
        ));
    }
    for heading in &outline.headings {
        if is_delta_title(&heading.title) {
            let title = &heading.title;
            findings.push(SpecFinding::new(
                FindingCode::DeltaSectionInLivingSpec,
                file,
                heading.line,
                None,
                format!("the spec holds the delta section `{title}`"),
            ));
        }
    }
    findings.extend(duplicates(file, &inside));
    for requirement in &inside {
        findings.extend(requirement_findings(
            file,
            &requirement.requirement,
            requirement.line,
            &requirement.scenario_lines,
        ));
    }
    findings.sort_by_key(|finding| finding.line);
    findings
}

/// Validates the `spec.md` of each folder directly under `specs_dir`.
///
/// Folders are read in byte order of their names, a folder without a
/// `spec.md` adds nothing, and a missing `specs_dir` gives no finding.
///
/// # Errors
///
/// Returns a `SpecsError` when a `spec.md` cannot be read or is not UTF-8.
///
/// Implements: rust-specs/living-spec-validation
pub fn validate_living_specs(specs_dir: &Path) -> Result<Vec<SpecFinding>, SpecsError> {
    let mut findings = Vec::new();
    for folder in folders(specs_dir) {
        let path = folder.join("spec.md");
        if !path.is_file() {
            continue;
        }
        let file = path.display().to_string();
        let text = read_text(&path)?;
        findings.extend(validate_living_spec(&file, &text));
    }
    Ok(findings)
}

/// True when `requirement` sits under the section heading at `section`.
fn in_section(requirement: &RequirementOutline, section: Option<usize>) -> bool {
    section.is_some_and(|index| requirement.section == Some(index))
}

/// The duplicate-requirement findings of the section's requirements.
fn duplicates(file: &str, requirements: &[&RequirementOutline]) -> Vec<SpecFinding> {
    let mut seen: Vec<&str> = Vec::new();
    let mut findings = Vec::new();
    for requirement in requirements {
        let name = requirement.requirement.name.as_str();
        if seen.contains(&name) {
            findings.push(SpecFinding::new(
                FindingCode::DuplicateRequirement,
                file,
                requirement.line,
                Some(name.to_string()),
                format!("requirement `{name}` is declared more than once"),
            ));
        } else {
            seen.push(name);
        }
    }
    findings
}

/// True for a `##` heading that is one of the four delta section titles.
fn is_delta_title(title: &str) -> bool {
    [
        "ADDED Requirements",
        "MODIFIED Requirements",
        "REMOVED Requirements",
        "RENAMED Requirements",
    ]
    .iter()
    .any(|delta| title.eq_ignore_ascii_case(delta))
}

/// The folders directly under `specs_dir`, in byte order of their names.
fn folders(specs_dir: &Path) -> Vec<PathBuf> {
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
fn read_text(path: &Path) -> Result<String, SpecsError> {
    std::fs::read_to_string(path).map_err(|error| SpecsError::Read {
        path: path.to_path_buf(),
        message: error.to_string(),
    })
}
