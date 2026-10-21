//! Parsing `openspec/queue.md` into queue items.

use std::collections::HashSet;
use std::fmt::Write as _;

use sha2::{Digest, Sha256};

/// One queue item as the queue file describes it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct QueueItem {
    /// The item's slug.
    pub(crate) slug: String,
    /// The item's title.
    pub(crate) title: String,
    /// The slugs the item depends on, in line order.
    pub(crate) dependencies: Vec<String>,
    /// The slugs the item fixes, in line order.
    pub(crate) fixes: Vec<String>,
    /// The item's brief body, trimmed.
    pub(crate) body: String,
    /// The `sha256:` digest of the item's raw text.
    pub(crate) hash: String,
}

/// Splits and parses a queue file, refusing the first malformed item.
///
/// Implements: rust-plan/queue-items
/// Implements: rust-plan/queue-refusals
pub(super) fn parse_queue(content: &str) -> Result<Vec<QueueItem>, String> {
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
    Ok(items)
}

/// The byte offsets where item headings start.
///
/// Implements: rust-plan/queue-items
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
///
/// Implements: rust-plan/queue-items
fn is_item_like(line: &str) -> bool {
    let Some(rest) = line.strip_prefix("##") else {
        return false;
    };
    rest.trim_start_matches([' ', '\t']).starts_with('[')
}

/// Parses one item's raw text, including its heading, dependency and fixes.
///
/// Implements: rust-plan/queue-items
/// Implements: rust-plan/queue-refusals
fn parse_section(raw: &str, seen: &HashSet<String>) -> Result<QueueItem, String> {
    let lines: Vec<&str> = raw.split('\n').collect();
    let heading = strip_cr(lines.first().copied().unwrap_or_default());
    let Some((slug_text, title)) = parse_heading(heading) else {
        return Err(format!(
            "malformed queue item heading {}",
            quote(heading.trim())
        ));
    };
    let slug = slug_text.trim();
    if !is_slug(slug) {
        return Err(format!("invalid queue item slug {}", quote(slug)));
    }
    if seen.contains(slug) {
        return Err(format!("duplicate queue item slug {}", quote(slug)));
    }
    let dep_index = first_nonblank(&lines, 1)
        .ok_or_else(|| format!("queue item {} is missing its Depends on: line", quote(slug)))?;
    let Some(dep_value) = value_after(strip_cr(lines[dep_index]), "Depends on:") else {
        return Err(format!(
            "queue item {} has a malformed dependency line",
            quote(slug)
        ));
    };
    if dep_value.is_empty() {
        return Err(format!(
            "queue item {} has an empty dependency line",
            quote(slug)
        ));
    }
    let dependencies = dependencies(dep_value, slug, seen)?;
    let (fixes, body_start) = parse_fixes(&lines, dep_index, slug, seen)?;
    let body = lines[body_start..].join("\n").trim().to_owned();
    if body.is_empty() {
        return Err(format!(
            "queue item {} has an empty brief body",
            quote(slug)
        ));
    }
    if body
        .split('\n')
        .any(|line| line.trim_start().starts_with("Depends on:"))
    {
        return Err(format!(
            "queue item {} has more than one Depends on: line",
            quote(slug)
        ));
    }
    if body
        .split('\n')
        .any(|line| line.trim_start().starts_with("Fixes:"))
    {
        return Err(format!(
            "queue item {} has more than one Fixes: line",
            quote(slug)
        ));
    }
    Ok(QueueItem {
        slug: slug.to_owned(),
        title: title.to_owned(),
        dependencies,
        fixes,
        body,
        hash: hash_content(raw),
    })
}

/// The `sha256:` digest of an item's raw text, as lowercase hexadecimal.
///
/// Implements: rust-plan/queue-item-hash
fn hash_content(content: &str) -> String {
    let digest = Sha256::digest(content.as_bytes());
    let mut hex = String::with_capacity(64);
    for byte in digest {
        let _ = write!(hex, "{byte:02x}");
    }
    format!("sha256:{hex}")
}

/// Reads a heading into its bracket text and title.
///
/// Implements: rust-plan/queue-items
/// Implements: rust-plan/queue-refusals
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
///
/// Implements: rust-plan/queue-items
fn strip_cr(line: &str) -> &str {
    line.strip_suffix('\r').unwrap_or(line)
}

/// Drops one leading space or tab from text.
///
/// Implements: rust-plan/queue-items
fn strip_one_space_or_tab(text: &str) -> Option<&str> {
    let first = text.chars().next()?;
    if first == ' ' || first == '\t' {
        Some(&text[first.len_utf8()..])
    } else {
        None
    }
}

/// The first non-blank line at or after a position.
///
/// Implements: rust-plan/queue-items
fn first_nonblank(lines: &[&str], start: usize) -> Option<usize> {
    lines
        .iter()
        .enumerate()
        .skip(start)
        .find(|(_, line)| !line.trim().is_empty())
        .map(|(index, _)| index)
}

/// The value after a line prefix, with surrounding whitespace trimmed.
///
/// Implements: rust-plan/queue-items
fn value_after<'a>(line: &'a str, prefix: &str) -> Option<&'a str> {
    let rest = line.strip_prefix(prefix)?;
    let rest = rest.trim_start_matches([' ', '\t']);
    Some(rest.trim_end_matches([' ', '\t', '\r']).trim())
}

/// Reads a dependency value into its ordered slugs.
///
/// Implements: rust-plan/queue-items
/// Implements: rust-plan/queue-refusals
fn dependencies(value: &str, slug: &str, seen: &HashSet<String>) -> Result<Vec<String>, String> {
    let mut dependencies = Vec::new();
    if value == "nothing" {
        return Ok(dependencies);
    }
    let mut seen_dependencies = HashSet::new();
    for token in value.split(',').map(str::trim) {
        if !is_slug(token) {
            return Err(format!(
                "queue item {} has an invalid dependency {}",
                quote(slug),
                quote(token)
            ));
        }
        if !seen_dependencies.insert(token) {
            return Err(format!(
                "queue item {} repeats dependency {}",
                quote(slug),
                quote(token)
            ));
        }
        if token == slug || !seen.contains(token) {
            return Err(format!(
                "queue item {} dependency {} must reference an earlier item",
                quote(slug),
                quote(token)
            ));
        }
        dependencies.push(token.to_owned());
    }
    Ok(dependencies)
}

/// Reads an optional fixes line and the index where the brief body starts.
///
/// Implements: rust-plan/queue-items
/// Implements: rust-plan/queue-refusals
fn parse_fixes(
    lines: &[&str],
    after: usize,
    slug: &str,
    seen: &HashSet<String>,
) -> Result<(Vec<String>, usize), String> {
    let Some(index) = first_nonblank(lines, after.saturating_add(1)) else {
        return Ok((Vec::new(), after.saturating_add(1)));
    };
    let Some(value) = value_after(strip_cr(lines[index]), "Fixes:") else {
        return Ok((Vec::new(), after.saturating_add(1)));
    };
    if value.is_empty() {
        return Err(format!(
            "queue item {} has an empty fixes line",
            quote(slug)
        ));
    }
    let mut fixes = Vec::new();
    let mut seen_fixes = HashSet::new();
    for token in value.split(',').map(str::trim) {
        if !is_slug(token) {
            return Err(format!(
                "queue item {} has an invalid fix {}",
                quote(slug),
                quote(token)
            ));
        }
        if !seen_fixes.insert(token) {
            return Err(format!(
                "queue item {} repeats fix {}",
                quote(slug),
                quote(token)
            ));
        }
        if token == slug || !seen.contains(token) {
            return Err(format!(
                "queue item {} fix {} must reference an earlier item",
                quote(slug),
                quote(token)
            ));
        }
        fixes.push(token.to_owned());
    }
    Ok((fixes, index.saturating_add(1)))
}

/// Whether text matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
///
/// Implements: rust-plan/queue-items
/// Implements: rust-plan/queue-refusals
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

/// Writes text as the JSON string literal a refusal detail quotes.
///
/// Implements: rust-plan/queue-refusals
fn quote(text: &str) -> String {
    let mut quoted = String::from("\"");
    for character in text.chars() {
        match character {
            '"' => quoted.push_str("\\\""),
            '\\' => quoted.push_str("\\\\"),
            '\n' => quoted.push_str("\\n"),
            '\r' => quoted.push_str("\\r"),
            '\t' => quoted.push_str("\\t"),
            '\u{8}' => quoted.push_str("\\b"),
            '\u{c}' => quoted.push_str("\\f"),
            control if control < '\u{20}' => {
                let _ = write!(quoted, "\\u{:04x}", control as u32);
            }
            other => quoted.push(other),
        }
    }
    quoted.push('"');
    quoted
}
