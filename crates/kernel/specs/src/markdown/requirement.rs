//! Parsing of `### Requirement:` blocks.

use super::scenario::{parse_scenario, starts_scenario};
use super::text::{
    is_js_whitespace, is_top_level_heading, js_trim, js_trim_end, normalize_line_endings,
    normalize_requirement_name, strip_prefix_ci,
};
use super::types::Requirement;

/// The text after `###`, whitespace, `Requirement:` and whitespace.
pub(crate) fn requirement_header_text(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("###")?;
    let rest = rest.trim_start_matches(is_js_whitespace);
    let rest = strip_prefix_ci(rest, "Requirement:")?;
    Some(rest.trim_start_matches(is_js_whitespace))
}

/// The normalized name of a requirement header line, if it is one.
pub(crate) fn requirement_header_name(line: &str) -> Option<String> {
    requirement_header_text(line).map(normalize_requirement_name)
}

/// Parses one requirement block: header, body and scenarios.
///
/// Implements: rust-specs/requirement-blocks
#[must_use]
pub fn parse_requirement(block: &str) -> Requirement {
    let normalized = normalize_line_endings(block);
    let lines: Vec<&str> = normalized.split('\n').collect();
    let header = lines.first().copied().unwrap_or_default();
    let name = requirement_header_name(header).unwrap_or_default();

    let mut starts = Vec::new();
    for (index, line) in lines.iter().enumerate().skip(1) {
        if starts_scenario(line) {
            starts.push(index);
        }
    }

    let body_end = starts.first().copied().unwrap_or(lines.len());
    let body_lines = lines.get(1..body_end).unwrap_or_default();
    let body = js_trim(&body_lines.join("\n")).to_string();

    let scenarios = starts
        .iter()
        .enumerate()
        .map(|(position, start)| {
            let end = starts.get(position + 1).copied().unwrap_or(lines.len());
            parse_scenario(&lines[*start..end].join("\n"))
        })
        .collect();

    Requirement {
        name,
        body,
        scenarios,
        raw: js_trim_end(&normalized).to_string(),
    }
}

/// Collects the requirement blocks of section lines, skipping fenced lines.
pub(crate) fn blocks_in(lines: &[&str], mask: &[bool]) -> Vec<Requirement> {
    let mut blocks = Vec::new();
    let mut cursor = 0;
    while let Some(start) = (cursor..lines.len())
        .find(|index| !mask[*index] && requirement_header_text(lines[*index]).is_some())
    {
        let end = (start.saturating_add(1)..lines.len())
            .find(|index| {
                !mask[*index]
                    && (requirement_header_text(lines[*index]).is_some()
                        || is_top_level_heading(lines[*index]))
            })
            .unwrap_or(lines.len());
        blocks.push(parse_requirement(&lines[start..end].join("\n")));
        cursor = end;
    }
    blocks
}
