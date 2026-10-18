//! A line-accurate scan of a Markdown document: headings and requirement blocks.

use crate::markdown::requirement::{parse_requirement, requirement_header_text};
use crate::markdown::scenario::starts_scenario;
use crate::markdown::text::{fence_mask, is_top_level_heading, js_trim, normalize_document};
use crate::markdown::types::Requirement;

/// One `##` heading outside a code fence.
pub(crate) struct Heading {
    /// The 1-based line of the heading.
    pub(crate) line: usize,
    /// The trimmed heading title.
    pub(crate) title: String,
}

/// One requirement block outside a code fence.
pub(crate) struct RequirementOutline {
    /// The 1-based line of the requirement header.
    pub(crate) line: usize,
    /// The parsed requirement block.
    pub(crate) requirement: Requirement,
    /// The 1-based line of every scenario header, in document order.
    pub(crate) scenario_lines: Vec<usize>,
    /// The index of the `##` heading the block sits under, or none.
    pub(crate) section: Option<usize>,
}

/// Every `##` heading and requirement block of a document, with its lines.
pub(crate) struct Outline {
    /// The `##` headings outside code fences.
    pub(crate) headings: Vec<Heading>,
    /// The requirement blocks outside code fences.
    pub(crate) requirements: Vec<RequirementOutline>,
}

/// Scans a document into its headings and requirement blocks.
pub(crate) fn scan(text: &str) -> Outline {
    let normalized = normalize_document(text);
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mask = fence_mask(&lines);
    let mut headings = Vec::new();
    let mut requirements = Vec::new();
    let mut section = None;
    for (index, line) in lines.iter().enumerate() {
        if mask[index] {
            continue;
        }
        if is_top_level_heading(line) {
            let rest = line.strip_prefix("##").unwrap_or_default();
            headings.push(Heading {
                line: index + 1,
                title: js_trim(rest).to_string(),
            });
            section = Some(headings.len() - 1);
        } else if requirement_header_text(line).is_some() {
            requirements.push(block_at(&lines, &mask, index, section));
        }
    }
    Outline {
        headings,
        requirements,
    }
}

/// Parses the requirement block that starts at `start`.
fn block_at(
    lines: &[&str],
    mask: &[bool],
    start: usize,
    section: Option<usize>,
) -> RequirementOutline {
    let end = (start + 1..lines.len())
        .find(|index| {
            !mask[*index]
                && (requirement_header_text(lines[*index]).is_some()
                    || is_top_level_heading(lines[*index]))
        })
        .unwrap_or(lines.len());
    let block = &lines[start..end];
    let scenario_lines = block
        .iter()
        .enumerate()
        .filter(|(_, line)| starts_scenario(line))
        .map(|(offset, _)| start + offset + 1)
        .collect();
    RequirementOutline {
        line: start + 1,
        requirement: parse_requirement(&block.join("\n")),
        scenario_lines,
        section,
    }
}
