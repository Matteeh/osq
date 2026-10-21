//! Reading what a proposal's human steps ask before approval.
//!
//! Implements: rust-storage/planning-facts

use std::fs;
use std::path::Path;

use crate::read::text::markdown_body;

/// Reads a folder's proposal into its part before approval, or `None`.
pub(super) fn before_approval(folder: &Path) -> Option<String> {
    let text = fs::read_to_string(folder.join("proposal.md")).ok()?;
    let section = human_steps_section(markdown_body(&text))?;
    before_part(&section)
}

/// The body of the first `## Human steps` section, up to the next `## ` line.
fn human_steps_section(body: &str) -> Option<String> {
    let lines: Vec<&str> = body.lines().collect();
    let start = lines.iter().position(|line| {
        line.strip_prefix("## ")
            .is_some_and(|rest| rest.trim().eq_ignore_ascii_case("human steps"))
    })?;
    let section: Vec<&str> = lines[start + 1..]
        .iter()
        .take_while(|line| !line.starts_with("## "))
        .copied()
        .collect();
    Some(section.join("\n"))
}

/// The part from a `### Before approval` heading to a `### After landing` one.
fn before_part(section: &str) -> Option<String> {
    let mut before: Vec<&str> = Vec::new();
    let mut in_before = false;
    for line in section.lines() {
        match subsection(line) {
            Some(true) => {
                in_before = true;
                continue;
            }
            Some(false) => {
                in_before = false;
                continue;
            }
            None => {}
        }
        if in_before {
            before.push(line);
        }
    }
    normalize(&before.join("\n"))
}

/// Whether a line is the before-approval or the after-landing `###` heading.
fn subsection(line: &str) -> Option<bool> {
    let text = line.strip_prefix("### ")?.trim();
    if text.eq_ignore_ascii_case("before approval") {
        return Some(true);
    }
    if text.eq_ignore_ascii_case("after landing") {
        return Some(false);
    }
    None
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
