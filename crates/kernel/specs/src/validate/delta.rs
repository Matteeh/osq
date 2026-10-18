//! Validating one delta spec on its own, without a living spec (ADR 026).

use super::delta_entries::{conflict_findings, duplicate_findings, entries, operation_kind};
use super::delta_scan::{DeltaOutline, scan_delta};
use super::finding::{FindingCode, SpecFinding};
use super::requirement::requirement_findings;
use super::sort_findings;

/// Validates one delta spec and returns its findings.
///
/// Implements: rust-specs/delta-spec-validation
#[must_use]
pub fn validate_delta(file: &str, text: &str) -> Vec<SpecFinding> {
    let scan = scan_delta(text);
    let mut findings = Vec::new();
    outside_findings(file, &scan, &mut findings);
    section_findings(file, &scan, &mut findings);
    let named = entries(&scan);
    duplicate_findings(file, &named, &mut findings);
    rename_findings(file, &scan, &mut findings);
    requirement_rule_findings(file, &scan, &mut findings);
    conflict_findings(file, &named, &mut findings);
    sort_findings(&mut findings);
    findings
}

/// True for a heading that is one of the four delta operation titles.
fn is_operation(title: &str) -> bool {
    [
        "ADDED Requirements",
        "MODIFIED Requirements",
        "REMOVED Requirements",
        "RENAMED Requirements",
    ]
    .iter()
    .any(|operation| title.eq_ignore_ascii_case(operation))
}

/// True for a heading that may hold requirement headers.
fn holds_requirements(title: &str) -> bool {
    [
        "ADDED Requirements",
        "MODIFIED Requirements",
        "REMOVED Requirements",
    ]
    .iter()
    .any(|operation| title.eq_ignore_ascii_case(operation))
}

/// The findings about the delta's headings.
fn section_findings(file: &str, scan: &DeltaOutline, findings: &mut Vec<SpecFinding>) {
    for section in &scan.sections {
        let title = &section.title;
        if is_operation(title) || title.eq_ignore_ascii_case("purpose") {
            continue;
        }
        findings.push(SpecFinding::new(
            FindingCode::UnknownDeltaSection,
            file,
            section.line,
            None,
            format!("the delta holds the section `{title}`"),
        ));
    }
    for section in &scan.sections {
        if !is_operation(&section.title) || section.has_entry {
            continue;
        }
        let title = &section.title;
        findings.push(SpecFinding::new(
            FindingCode::EmptyDeltaSection,
            file,
            section.line,
            None,
            format!("the delta section `{title}` holds no entry"),
        ));
    }
    if !scan
        .sections
        .iter()
        .any(|section| is_operation(&section.title))
    {
        findings.push(SpecFinding::new(
            FindingCode::MissingDeltaSections,
            file,
            1,
            None,
            "the delta has no ADDED, MODIFIED, REMOVED or RENAMED section".to_string(),
        ));
    }
}

/// The findings about requirement headers outside an operation section.
fn outside_findings(file: &str, scan: &DeltaOutline, findings: &mut Vec<SpecFinding>) {
    for requirement in &scan.requirements {
        let inside = requirement
            .section
            .and_then(|index| scan.sections.get(index))
            .is_some_and(|section| holds_requirements(&section.title));
        if inside {
            continue;
        }
        let name = &requirement.requirement.name;
        findings.push(SpecFinding::new(
            FindingCode::RequirementOutsideSection,
            file,
            requirement.line,
            Some(name.clone()),
            format!("requirement `{name}` sits outside an ADDED, MODIFIED or REMOVED section"),
        ));
    }
}

/// The findings about the delta's rename lines.
fn rename_findings(file: &str, scan: &DeltaOutline, findings: &mut Vec<SpecFinding>) {
    for side in &scan.unpaired {
        let name = &side.name;
        findings.push(SpecFinding::new(
            FindingCode::UnpairedRename,
            file,
            side.line,
            Some(name.clone()),
            format!("the rename side `{name}` has no partner"),
        ));
    }
    for line in &scan.invalid_renames {
        findings.push(SpecFinding::new(
            FindingCode::InvalidRename,
            file,
            *line,
            None,
            "a rename line is not a valid FROM or TO line".to_string(),
        ));
    }
}

/// The requirement findings of every ADDED and MODIFIED requirement.
fn requirement_rule_findings(file: &str, scan: &DeltaOutline, findings: &mut Vec<SpecFinding>) {
    for requirement in &scan.requirements {
        let checked = requirement
            .section
            .and_then(|index| scan.sections.get(index))
            .and_then(|section| operation_kind(&section.title))
            .is_some();
        if checked {
            findings.extend(requirement_findings(
                file,
                &requirement.requirement,
                requirement.line,
                &requirement.scenario_lines,
            ));
        }
    }
}
