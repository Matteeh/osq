//! The rules a requirement's body and scenarios must meet.

use super::finding::{FindingCode, SpecFinding};
use crate::markdown::text::fence_mask;
use crate::markdown::types::Requirement;

/// Finds what one requirement breaks, at its header line and scenario lines.
pub(crate) fn requirement_findings(
    file: &str,
    requirement: &Requirement,
    line: usize,
    scenario_lines: &[usize],
) -> Vec<SpecFinding> {
    let name = &requirement.name;
    let mut findings = Vec::new();
    if !has_keyword(&requirement.body) {
        findings.push(SpecFinding::new(
            FindingCode::RequirementWithoutShall,
            file,
            line,
            Some(name.clone()),
            format!("requirement `{name}` states no SHALL or MUST"),
        ));
    }
    if requirement.scenarios.is_empty() {
        findings.push(SpecFinding::new(
            FindingCode::RequirementWithoutScenario,
            file,
            line,
            Some(name.clone()),
            format!("requirement `{name}` has no scenario"),
        ));
    }
    findings.extend(scenario_findings(file, requirement, name, scenario_lines));
    findings
}

/// Finds what one requirement's scenarios break.
fn scenario_findings(
    file: &str,
    requirement: &Requirement,
    name: &str,
    scenario_lines: &[usize],
) -> Vec<SpecFinding> {
    let mut findings = Vec::new();
    let mut seen: Vec<&str> = Vec::new();
    for (scenario, line) in requirement.scenarios.iter().zip(scenario_lines) {
        let line = *line;
        let scenario_name = &scenario.name;
        if scenario.when.is_empty() {
            findings.push(SpecFinding::new(
                FindingCode::ScenarioWithoutWhen,
                file,
                line,
                Some(name.to_string()),
                format!("scenario `{scenario_name}` of requirement `{name}` has no WHEN bullet"),
            ));
        }
        if scenario.then.is_empty() {
            findings.push(SpecFinding::new(
                FindingCode::ScenarioWithoutThen,
                file,
                line,
                Some(name.to_string()),
                format!("scenario `{scenario_name}` of requirement `{name}` has no THEN bullet"),
            ));
        }
        if seen.contains(&scenario.name.as_str()) {
            findings.push(SpecFinding::new(
                FindingCode::DuplicateScenario,
                file,
                line,
                Some(name.to_string()),
                format!("requirement `{name}` repeats the scenario `{scenario_name}`"),
            ));
        } else {
            seen.push(scenario.name.as_str());
        }
    }
    findings
}

/// True when a body holds SHALL or MUST as a whole word outside code fences.
fn has_keyword(body: &str) -> bool {
    let text = unfenced(body);
    contains_keyword(&text, "SHALL") || contains_keyword(&text, "MUST")
}

/// The body without the lines a fence puts inside it and the fence lines.
fn unfenced(body: &str) -> String {
    let lines: Vec<&str> = body.split('\n').collect();
    let mask = fence_mask(&lines);
    let kept: Vec<&str> = lines
        .iter()
        .enumerate()
        .filter(|(index, _)| !mask[*index])
        .map(|(_, line)| *line)
        .collect();
    kept.join("\n")
}

/// True when `word` appears as one whole word of `text`.
fn contains_keyword(text: &str, word: &str) -> bool {
    text.split(|c: char| !is_word_char(c))
        .any(|token| token == word)
}

/// True for the characters a whole-word keyword may not touch.
fn is_word_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
