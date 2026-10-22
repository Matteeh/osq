//! Reading `openspec/queue.md` into the slugs and titles of its items.
//!
//! Every rule mirrors TypeScript's `parseQueue`, and one malformed item leaves
//! no titles at all.
//!
//! Implements: rust-storage/queue-item-titles

use std::collections::HashSet;
use std::fs;
use std::path::Path;

/// One queue item's slug and title.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QueueTitle {
    /// The item's slug, trimmed.
    pub slug: String,
    /// The item's title, trimmed.
    pub title: String,
}

/// Reads `<project_root>/openspec/queue.md` into its item titles, in file
/// order, and reads nothing when the file or any item is unusable.
///
/// Implements: rust-storage/queue-item-titles
#[must_use]
pub fn read_queue_titles(project_root: &Path) -> Vec<QueueTitle> {
    let path = project_root.join("openspec").join("queue.md");
    let Ok(content) = fs::read_to_string(path) else {
        return Vec::new();
    };
    parse_queue(&content).unwrap_or_default()
}

/// Parses every item of a queue file, or `None` when one is malformed.
fn parse_queue(content: &str) -> Option<Vec<QueueTitle>> {
    let starts = item_starts(content);
    let mut items = Vec::new();
    let mut seen = HashSet::new();
    for (index, start) in starts.iter().enumerate() {
        let end = starts
            .get(index.saturating_add(1))
            .copied()
            .unwrap_or(content.len());
        let item = parse_section(&content[*start..end], &seen)?;
        seen.insert(item.slug.clone());
        items.push(item);
    }
    Some(items)
}

/// The byte offsets where item headings start.
fn item_starts(content: &str) -> Vec<usize> {
    let mut starts = Vec::new();
    let mut offset = 0;
    for line in content.split('\n') {
        if is_item_like(line) {
            starts.push(offset);
        }
        offset += line.len().saturating_add(1);
    }
    starts
}

/// Whether a line begins an item: `##`, spaces or tabs, then `[`.
fn is_item_like(line: &str) -> bool {
    let Some(rest) = line.strip_prefix("##") else {
        return false;
    };
    rest.trim_start_matches([' ', '\t']).starts_with('[')
}

/// Parses one item's raw text, including its heading, dependency and fixes.
fn parse_section(raw: &str, seen: &HashSet<String>) -> Option<QueueTitle> {
    let lines: Vec<&str> = raw.split('\n').collect();
    let heading = strip_cr(lines.first().copied().unwrap_or_default());
    let (slug_text, title) = parse_heading(heading)?;
    let slug = slug_text.trim();
    if !is_slug(slug) || seen.contains(slug) {
        return None;
    }
    let dep_index = first_nonblank(&lines, 1)?;
    let dep_value = value_after(strip_cr(lines[dep_index]), "Depends on:")?;
    if dep_value.is_empty() {
        return None;
    }
    valid_dependencies(dep_value, slug, seen)?;
    let body_start = parse_fixes(&lines, dep_index, slug, seen)?;
    let body = lines[body_start..].join("\n");
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed
        .split('\n')
        .any(|line| line.trim_start().starts_with("Depends on:"))
    {
        return None;
    }
    if trimmed
        .split('\n')
        .any(|line| line.trim_start().starts_with("Fixes:"))
    {
        return None;
    }
    Some(QueueTitle {
        slug: slug.to_owned(),
        title: title.to_owned(),
    })
}

/// Reads a heading into its bracket text and title.
fn parse_heading(line: &str) -> Option<(&str, &str)> {
    let rest = line.strip_prefix("##")?;
    let rest = strip_one_space_or_tab(rest)?;
    let rest = rest.trim_start_matches([' ', '\t']);
    let rest = rest.strip_prefix('[')?;
    let end = rest.find([']', '\r', '\n'])?;
    if end == 0 {
        return None;
    }
    let slug_text = &rest[..end];
    let rest = rest[end..].strip_prefix(']')?;
    let rest = strip_one_space_or_tab(rest)?;
    let title_part = rest.trim_start_matches([' ', '\t']);
    let without_trailing = title_part.trim_end_matches([' ', '\t', '\r']);
    if without_trailing.is_empty()
        || without_trailing
            .chars()
            .next()
            .is_some_and(char::is_whitespace)
        || without_trailing.contains(['\r', '\u{2028}', '\u{2029}'])
    {
        return None;
    }
    Some((slug_text, without_trailing.trim()))
}

/// Drops one trailing carriage return from a line.
fn strip_cr(line: &str) -> &str {
    line.strip_suffix('\r').unwrap_or(line)
}

/// Drops one leading space or tab from text.
fn strip_one_space_or_tab(text: &str) -> Option<&str> {
    let first = text.chars().next()?;
    if first == ' ' || first == '\t' {
        Some(&text[first.len_utf8()..])
    } else {
        None
    }
}

/// The first non-blank line at or after a position.
fn first_nonblank(lines: &[&str], start: usize) -> Option<usize> {
    lines
        .iter()
        .enumerate()
        .skip(start)
        .find(|(_, line)| !line.trim().is_empty())
        .map(|(index, _)| index)
}

/// The value after a line prefix, with surrounding whitespace trimmed.
fn value_after<'a>(line: &'a str, prefix: &str) -> Option<&'a str> {
    let rest = line.strip_prefix(prefix)?;
    let rest = rest.trim_start_matches([' ', '\t']);
    Some(rest.trim_end_matches([' ', '\t', '\r']).trim())
}

/// Checks a dependency value's slugs: valid, unrepeated and earlier.
fn valid_dependencies(value: &str, slug: &str, seen: &HashSet<String>) -> Option<()> {
    if value == "nothing" {
        return Some(());
    }
    let mut seen_dependencies = HashSet::new();
    for token in value.split(',').map(str::trim) {
        if !is_slug(token) || !seen_dependencies.insert(token) {
            return None;
        }
        if token == slug || !seen.contains(token) {
            return None;
        }
    }
    Some(())
}

/// Checks an optional fixes line and returns where the brief body starts.
fn parse_fixes(lines: &[&str], after: usize, slug: &str, seen: &HashSet<String>) -> Option<usize> {
    let Some(index) = first_nonblank(lines, after.saturating_add(1)) else {
        return Some(after.saturating_add(1));
    };
    let Some(value) = value_after(strip_cr(lines[index]), "Fixes:") else {
        return Some(after.saturating_add(1));
    };
    if value.is_empty() {
        return None;
    }
    let mut seen_fixes = HashSet::new();
    for token in value.split(',').map(str::trim) {
        if !is_slug(token) || !seen_fixes.insert(token) {
            return None;
        }
        if token == slug || !seen.contains(token) {
            return None;
        }
    }
    Some(index.saturating_add(1))
}

/// Whether text matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
fn is_slug(text: &str) -> bool {
    let mut needs_character = true;
    for byte in text.bytes() {
        match byte {
            b'a'..=b'z' | b'0'..=b'9' => needs_character = false,
            b'-' if !needs_character => needs_character = true,
            _ => return false,
        }
    }
    !needs_character
}
