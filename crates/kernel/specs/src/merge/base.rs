//! The base spec's slices and the skeleton a new capability starts from.

use crate::markdown::requirement::requirement_header_text;
use crate::markdown::text::{
    fence_mask, is_named_heading, is_top_level_heading, js_trim, js_trim_end, normalize_document,
    normalize_requirement_name,
};

/// One verbatim requirement block of a base spec.
#[derive(Debug, Clone)]
pub(crate) struct Block {
    /// The normalized requirement name that keys the block.
    pub(crate) name: String,
    /// The block text with normalized line endings and no trailing whitespace.
    pub(crate) raw: String,
}

/// The slices of a base spec the merge writes back.
#[derive(Debug)]
pub(crate) struct RequirementSection {
    /// The text before the `## Requirements` heading.
    pub(crate) before: String,
    /// The `## Requirements` heading line.
    pub(crate) header_line: String,
    /// The text between the heading and the first requirement header.
    pub(crate) preamble: String,
    /// The requirement blocks, in document order.
    pub(crate) blocks: Vec<Block>,
    /// The text from the next `##` heading on.
    pub(crate) after: String,
}

/// Splits a base spec at its first `## Requirements` heading outside code fences.
#[must_use]
pub(crate) fn extract_requirements_section(content: &str) -> RequirementSection {
    let normalized = normalize_document(content);
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mask = fence_mask(&lines);
    let header_index = lines
        .iter()
        .enumerate()
        .find(|(index, line)| !mask[*index] && is_named_heading(line, "Requirements"))
        .map(|(index, _)| index);

    let Some(header_index) = header_index else {
        // `merge_delta` only takes this branch for a base whose trimmed text is
        // non-empty, so `before` is never empty here.
        return RequirementSection {
            before: format!("{}\n\n", js_trim_end(content)),
            header_line: "## Requirements".to_string(),
            preamble: String::new(),
            blocks: Vec::new(),
            after: String::new(),
        };
    };

    let end_index = (header_index.saturating_add(1)..lines.len())
        .find(|index| !mask[*index] && is_top_level_heading(lines[*index]))
        .unwrap_or(lines.len());

    let body_lines = &lines[header_index.saturating_add(1)..end_index];
    let body_mask = &mask[header_index.saturating_add(1)..end_index];
    let blocks = parse_blocks(body_lines, body_mask);

    let preamble_end = (0..body_lines.len())
        .find(|index| is_header(body_lines, body_mask, *index))
        .unwrap_or(body_lines.len());

    RequirementSection {
        // The write back trims this slice, so the trailing newline TypeScript
        // appends to it never shows.
        before: lines[..header_index].join("\n"),
        header_line: lines[header_index].to_string(),
        preamble: js_trim_end(&body_lines[..preamble_end].join("\n")).to_string(),
        blocks,
        after: lines[end_index..].join("\n"),
    }
}

/// The skeleton a capability without a base starts from.
#[must_use]
pub(crate) fn build_spec_skeleton(capability: &str, purpose: &str) -> String {
    /// The placeholder a missing purpose reads as.
    const PREFIX: &str = "TBD - created by archiving change ";
    /// What follows the capability in the placeholder.
    const SUFFIX: &str = ". Update Purpose after archive.";
    let purpose = js_trim(purpose);
    let body = if purpose.is_empty() {
        format!("{PREFIX}{capability}{SUFFIX}")
    } else {
        purpose.to_string()
    };
    format!("# {capability} Specification\n\n## Purpose\n{body}\n\n## Requirements\n")
}

/// Collects verbatim requirement blocks from an already-sliced section body.
///
/// The section body ends at the next `##` heading, so a block runs from its
/// header to the next requirement header, or to the end of the body.
fn parse_blocks(lines: &[&str], mask: &[bool]) -> Vec<Block> {
    let starts: Vec<usize> = (0..lines.len())
        .filter(|index| is_header(lines, mask, *index))
        .collect();
    starts
        .iter()
        .enumerate()
        .map(|(position, start)| {
            let end = starts
                .get(position.saturating_add(1))
                .copied()
                .unwrap_or(lines.len());
            let name = requirement_header_text(lines[*start])
                .map(normalize_requirement_name)
                .unwrap_or_default();
            Block {
                name,
                raw: js_trim_end(&lines[*start..end].join("\n")).to_string(),
            }
        })
        .collect()
}

/// True for a requirement header outside a code fence.
fn is_header(lines: &[&str], mask: &[bool], index: usize) -> bool {
    !mask[index] && requirement_header_text(lines[index]).is_some()
}
