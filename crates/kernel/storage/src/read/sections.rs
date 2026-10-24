//! Splitting an executor result file into its named sections.
//!
//! Every rule mirrors TypeScript's `parseResultSections`: headings may drift in
//! case, spacing and colons, an unknown heading ends the current section, and a
//! section whose only content is `None` reads as absent.
//!
//! Implements: rust-storage/result-sections

/// One named section of a result file, used to index the section buffers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SectionKey {
    /// The `## Changed` section.
    Changed,
    /// The `## Deviated` section.
    Deviated,
    /// The `## Missing context` section.
    MissingContext,
    /// The `## Outside scope` section.
    OutsideScope,
    /// The `## Blocked` section.
    Blocked,
    /// The `## Next` section.
    Next,
    /// The `Touched:` line or `## Touched` section.
    Touched,
}

/// The named sections of one executor result file; an absent one is `None`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResultSections {
    /// The `## Changed` section.
    pub changed: Option<String>,
    /// The `## Deviated` section.
    pub deviated: Option<String>,
    /// The `## Missing context` section.
    pub missing_context: Option<String>,
    /// The `## Outside scope` section.
    pub outside_scope: Option<String>,
    /// The `## Blocked` section.
    pub blocked: Option<String>,
    /// The `## Next` section.
    pub next: Option<String>,
    /// The `Touched:` line or `## Touched` section.
    pub touched: Option<String>,
}

/// A heading line: its known section, or `None` for an unknown one.
struct Heading {
    /// The recognized section, or `None` when the heading names an unknown one.
    key: Option<SectionKey>,
    /// Text after `touched:` on the same line, or `None` without the marker.
    inline: Option<String>,
}

/// Splits a result file into its named sections.
///
/// Implements: rust-storage/result-sections
#[must_use]
pub fn parse_result_sections(text: &str) -> ResultSections {
    let mut buffers: [Vec<String>; 7] = Default::default();
    let mut current = None;
    let mut inline_touched = None;
    for line in text.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if let Some(heading) = read_heading(line) {
            current = heading.key;
            if let Some(inline) = heading.inline.filter(|text| !text.is_empty()) {
                inline_touched = Some(inline);
            }
            continue;
        }
        if let Some(key) = current {
            buffers[key as usize].push(line.to_owned());
        }
    }
    ResultSections {
        changed: section(&buffers, SectionKey::Changed, None),
        deviated: section(&buffers, SectionKey::Deviated, None),
        missing_context: section(&buffers, SectionKey::MissingContext, None),
        outside_scope: section(&buffers, SectionKey::OutsideScope, None),
        blocked: section(&buffers, SectionKey::Blocked, None),
        next: section(&buffers, SectionKey::Next, None),
        touched: section(&buffers, SectionKey::Touched, inline_touched.as_deref()),
    }
}

/// One section's cleaned text, preferring the inline `touched:` text.
fn section(buffers: &[Vec<String>; 7], key: SectionKey, inline: Option<&str>) -> Option<String> {
    if key == SectionKey::Touched
        && let Some(inline) = inline
    {
        return clean_section(inline);
    }
    clean_section(&buffers[key as usize].join("\n"))
}

/// A heading line's match, or `None` for body text.
fn read_heading(raw: &str) -> Option<Heading> {
    let trimmed = raw.trim();
    if !trimmed.starts_with('#') && !starts_with_touched(trimmed) {
        return None;
    }
    let rest = trimmed.trim_start_matches('#').trim();
    if let Some(inline) = touched_inline(rest) {
        return Some(Heading {
            key: Some(SectionKey::Touched),
            inline: Some(inline.trim().to_owned()),
        });
    }
    Some(Heading {
        key: heading_key(rest),
        inline: None,
    })
}

/// The section a heading names, or `None` when its name is unknown.
fn heading_key(text: &str) -> Option<SectionKey> {
    match normalize_heading(text).as_str() {
        "changed" => Some(SectionKey::Changed),
        "deviated" => Some(SectionKey::Deviated),
        "missing context" => Some(SectionKey::MissingContext),
        "outside scope" => Some(SectionKey::OutsideScope),
        "blocked" => Some(SectionKey::Blocked),
        "next" => Some(SectionKey::Next),
        "touched" => Some(SectionKey::Touched),
        _ => None,
    }
}

/// Collapses whitespace runs to one space, trims, drops `#`s, one trailing
/// colon and case, as TypeScript's `normalizeHeading` does.
fn normalize_heading(text: &str) -> String {
    let collapsed = collapse_whitespace(text);
    let stripped = collapsed.trim_start_matches('#').trim();
    let without_colon = stripped.strip_suffix(':').map_or(stripped, str::trim);
    without_colon.to_lowercase()
}

/// Collapses every whitespace run to one space and trims both ends.
fn collapse_whitespace(text: &str) -> String {
    let mut collapsed = String::new();
    let mut in_whitespace = false;
    for character in text.chars() {
        if character.is_whitespace() {
            in_whitespace = true;
        } else {
            if in_whitespace {
                collapsed.push(' ');
            }
            collapsed.push(character);
            in_whitespace = false;
        }
    }
    collapsed
}

/// Whether a line begins with the word `touched`, ignoring case.
fn starts_with_touched(text: &str) -> bool {
    strip_touched(text).is_some_and(|rest| {
        rest.chars()
            .next()
            .is_none_or(|character| !(character.is_ascii_alphanumeric() || character == '_'))
    })
}

/// Strips a case-insensitive `touched` prefix, or `None` without one.
fn strip_touched(text: &str) -> Option<&str> {
    let prefix = text.get(..7)?;
    prefix.eq_ignore_ascii_case("touched").then(|| &text[7..])
}

/// The text after `touched:` on a heading line, or `None` without the marker.
fn touched_inline(text: &str) -> Option<&str> {
    let rest = strip_touched(text)?.trim_start();
    let after_colon = rest.strip_prefix(':')?;
    Some(after_colon.trim_start())
}

/// Section text that is empty, or only `None`, reads as absent; else trimmed.
fn clean_section(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lines: Vec<&str> = trimmed
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .filter(|line| !line.trim().is_empty())
        .collect();
    if lines.len() == 1 {
        let line = strip_list_marker(lines[0]).replace(['*', '_'], "");
        if only_none(line.trim()) {
            return None;
        }
    }
    Some(trimmed.to_owned())
}

/// Drops a leading `-`, `*`, `+` or number-and-`.` list marker and its spaces.
fn strip_list_marker(line: &str) -> &str {
    let trimmed = line.trim_start();
    if let Some(character) = trimmed.chars().next()
        && matches!(character, '-' | '*' | '+')
    {
        return trimmed[character.len_utf8()..].trim_start();
    }
    let digits = trimmed.chars().take_while(char::is_ascii_digit).count();
    let after_number = if digits == 0 {
        None
    } else {
        trimmed
            .get(digits..)
            .and_then(|rest| rest.strip_prefix('.'))
    };
    if let Some(after) = after_number {
        return after.trim_start();
    }
    line
}

/// Whether a line reads `None`, alone or followed by punctuation and text.
fn only_none(line: &str) -> bool {
    let Some(prefix) = line.get(..4) else {
        return false;
    };
    if !prefix.eq_ignore_ascii_case("none") {
        return false;
    }
    let tail = &line[4..];
    tail.is_empty() || tail.starts_with(['.', ';', ',', ':'])
}
