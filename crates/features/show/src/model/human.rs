//! Reading the two human-steps halves of a proposal.

use std::fs;
use std::path::Path;

use osq_kernel_specs::{parse_frontmatter, section};

/// The before-approval and after-landing steps, each absent when empty or `None`.
pub(crate) fn read(path: &Path) -> Result<(Option<String>, Option<String>), String> {
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let body = parse_frontmatter(&text)
        .map(|frontmatter| frontmatter.body)
        .unwrap_or(text);
    let steps = section(&body, "Human steps");
    if steps.is_empty() {
        return Ok((None, None));
    }
    let mut before = Vec::new();
    let mut after = Vec::new();
    let mut current = Part::Preamble;
    for line in steps.split('\n') {
        if let Some(part) = heading(line) {
            current = part;
        } else if current == Part::Before {
            before.push(line);
        } else {
            after.push(line);
        }
    }
    Ok((normalize(&before.join("\n")), normalize(&after.join("\n"))))
}

/// The part a `### ` line opens.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Part {
    /// Text before the first subsection.
    Preamble,
    /// The `### Before approval` subsection.
    Before,
    /// The `### After landing` subsection.
    After,
}

/// The part a `### ` heading names, or `None` for body text.
fn heading(line: &str) -> Option<Part> {
    let text = line.strip_prefix("###")?.trim().to_lowercase();
    match text.as_str() {
        "before approval" => Some(Part::Before),
        "after landing" => Some(Part::After),
        _ => None,
    }
}

/// A trimmed part, or `None` when it is empty or reads `None` or `None.`.
fn normalize(text: &str) -> Option<String> {
    let trimmed = text.trim();
    let none = trimmed.eq_ignore_ascii_case("none") || trimmed.eq_ignore_ascii_case("none.");
    if trimmed.is_empty() || none {
        return None;
    }
    Some(trimmed.to_owned())
}
