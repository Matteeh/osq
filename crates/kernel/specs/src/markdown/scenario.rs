//! Parsing of `#### Scenario:` blocks and their outcome tables.

use super::table::read_rows;
use super::text::{
    is_js_whitespace, js_trim, js_trim_end, normalize_line_endings, normalize_requirement_name,
    strip_prefix_ci,
};
use super::types::{Outcome, Scenario};

/// True when a line starts a scenario: `####` and whitespace.
pub(crate) fn starts_scenario(line: &str) -> bool {
    line.strip_prefix("####")
        .and_then(|rest| rest.chars().next())
        .is_some_and(is_js_whitespace)
}

/// The scenario name without its header prefix and closing hashes.
fn scenario_name(line: &str) -> String {
    let rest = line
        .strip_prefix("####")
        .map_or(line, |text| text.trim_start_matches(is_js_whitespace));
    let normalized = normalize_requirement_name(rest);
    let without_label = strip_prefix_ci(&normalized, "Scenario:").unwrap_or(&normalized);
    js_trim(without_label).to_string()
}

/// The trimmed text of a `-` bullet carrying `marker`, if the line is one.
fn bullet_text<'a>(line: &'a str, marker: &str) -> Option<&'a str> {
    let rest = line.strip_prefix('-')?;
    let first = rest.chars().next()?;
    if first != ' ' && first != '\t' {
        return None;
    }
    let rest = rest.trim_start_matches([' ', '\t']);
    rest.strip_prefix(marker).map(js_trim)
}

/// Parses one scenario block: header, WHEN and THEN bullets, and outcomes.
///
/// Implements: rust-specs/scenario-blocks
#[must_use]
pub fn parse_scenario(block: &str) -> Scenario {
    let normalized = normalize_line_endings(block);
    let lines: Vec<&str> = normalized.split('\n').collect();
    let header = lines.first().copied().unwrap_or_default();

    let mut when = Vec::new();
    let mut then = Vec::new();
    let mut outcomes = Vec::new();
    let mut then_seen = false;

    for (index, line) in lines.iter().enumerate().skip(1) {
        if let Some(text) = bullet_text(line, "**WHEN**") {
            when.push(text.to_string());
            then_seen = false;
        } else if let Some(text) = bullet_text(line, "**THEN**") {
            then.push(text.to_string());
            let rows = read_rows(&lines, index.saturating_add(1));
            outcomes.push(Outcome {
                text: text.to_string(),
                rows,
            });
            then_seen = true;
        } else if then_seen {
            if let Some(text) = bullet_text(line, "**AND**") {
                let rows = read_rows(&lines, index.saturating_add(1));
                outcomes.push(Outcome {
                    text: text.to_string(),
                    rows,
                });
            }
        }
    }

    Scenario {
        name: scenario_name(header),
        when,
        then,
        outcomes,
        raw: js_trim_end(&normalized).to_string(),
    }
}
