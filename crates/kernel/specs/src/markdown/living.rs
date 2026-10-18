//! Parsing of living capability specs.

use super::ownership::code_ownership;
use super::requirement::blocks_in;
use super::text::{is_named_heading, is_top_level_heading, js_trim, normalize_document};
use super::types::{LivingSpec, Requirement};

/// The trimmed rest of the first `#` heading line, or empty text.
pub(crate) fn first_title(lines: &[&str], mask: &[bool]) -> String {
    for (index, line) in lines.iter().enumerate() {
        if mask[index] {
            continue;
        }
        if let Some(rest) = line.strip_prefix('#') {
            let first = rest.chars().next();
            if matches!(first, Some(' ' | '\t')) {
                return js_trim(rest).to_string();
            }
        }
    }
    String::new()
}

/// The trimmed body of the first `## Purpose` section, or empty text.
pub(crate) fn purpose_of(lines: &[&str], mask: &[bool]) -> String {
    let start = lines
        .iter()
        .enumerate()
        .find(|(index, line)| !mask[*index] && is_named_heading(line, "Purpose"))
        .map(|(index, _)| index);
    let Some(start) = start else {
        return String::new();
    };
    let end = (start.saturating_add(1)..lines.len())
        .find(|index| !mask[*index] && is_top_level_heading(lines[*index]))
        .unwrap_or(lines.len());
    js_trim(&lines[start + 1..end].join("\n")).to_string()
}

/// The requirement blocks of the first `## Requirements` section.
fn requirements_of(lines: &[&str], mask: &[bool]) -> Vec<Requirement> {
    let start = lines
        .iter()
        .enumerate()
        .find(|(index, line)| !mask[*index] && is_named_heading(line, "Requirements"))
        .map(|(index, _)| index);
    let Some(start) = start else {
        return Vec::new();
    };
    let end = (start.saturating_add(1)..lines.len())
        .find(|index| !mask[*index] && is_top_level_heading(lines[*index]))
        .unwrap_or(lines.len());
    blocks_in(
        &lines[start.saturating_add(1)..end],
        &mask[start.saturating_add(1)..end],
    )
}

/// Parses a living capability spec into its title, purpose and requirements.
///
/// Implements: rust-specs/living-specs
#[must_use]
pub fn parse_living_spec(text: &str) -> LivingSpec {
    let normalized = normalize_document(text);
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mask = super::text::fence_mask(&lines);

    LivingSpec {
        title: first_title(&lines, &mask),
        purpose: purpose_of(&lines, &mask),
        requirements: requirements_of(&lines, &mask),
        code_ownership: code_ownership(&normalized),
    }
}
