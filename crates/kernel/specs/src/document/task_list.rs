//! Parsing of a `tasks.md` checklist.

use super::types::ChecklistItem;
use crate::markdown::text::{is_js_whitespace, js_trim};

/// Parses a `tasks.md` checklist into its items, line by line.
///
/// Implements: rust-specs/task-lists
#[must_use]
pub fn parse_task_list(text: &str) -> Vec<ChecklistItem> {
    let mut items = Vec::new();
    let mut section: Option<String> = None;
    for (index, raw) in text.split('\n').enumerate() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        if let Some(title) = section_heading(line) {
            section = Some(title);
        } else if let Some(item) = checklist_item(line, section.as_deref(), index + 1) {
            items.push(item);
        }
    }
    items
}

/// The trimmed rest of a `##` section heading line, or `None` when it is not one.
fn section_heading(line: &str) -> Option<String> {
    let rest = line.strip_prefix("##")?;
    if !rest.chars().next().is_some_and(is_js_whitespace) {
        return None;
    }
    Some(js_trim(rest).to_string())
}

/// One checklist item parsed from `line`, under `section` and at `number`'s line.
fn checklist_item(line: &str, section: Option<&str>, number: usize) -> Option<ChecklistItem> {
    let rest = line.strip_prefix('-').or_else(|| line.strip_prefix('*'))?;
    let rest = strip_whitespace(rest)?;
    let rest = rest.strip_prefix('[')?;
    let checked = match rest.chars().next() {
        Some(' ') => false,
        Some('x' | 'X') => true,
        _ => return None,
    };
    let rest = rest[1..].strip_prefix(']')?;
    let rest = strip_whitespace(rest)?;
    let (item_number, rest) = match number_prefix(rest) {
        Some((value, after)) if !after.is_empty() => (Some(value), after),
        _ => (None, rest),
    };
    if rest.is_empty() {
        return None;
    }
    Some(ChecklistItem {
        number: item_number,
        title: js_trim(rest).to_string(),
        checked,
        section: section.map(str::to_string),
        line: number,
    })
}

/// A leading `N.` or `N)` and the whitespace after it, when the title follows.
fn number_prefix(rest: &str) -> Option<(u32, &str)> {
    let digits_end = rest
        .find(|character: char| !character.is_ascii_digit())
        .unwrap_or(rest.len());
    if digits_end == 0 {
        return None;
    }
    let after_digits = &rest[digits_end..];
    match after_digits.chars().next() {
        Some('.' | ')') => {}
        _ => return None,
    }
    let after_marker = strip_whitespace(&after_digits[1..])?;
    Some((rest[..digits_end].parse().ok()?, after_marker))
}

/// Drops one or more leading JavaScript whitespace characters, if any.
fn strip_whitespace(text: &str) -> Option<&str> {
    match text.chars().next() {
        Some(character) if is_js_whitespace(character) => {
            Some(text.trim_start_matches(is_js_whitespace))
        }
        _ => None,
    }
}
