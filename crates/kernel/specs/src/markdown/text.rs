//! JavaScript-compatible text rules shared by the Markdown parsers.

/// True for JavaScript's `\s`: Unicode whitespace except U+0085, plus U+FEFF.
pub(crate) fn is_js_whitespace(c: char) -> bool {
    (c.is_whitespace() && c != '\u{0085}') || c == '\u{feff}'
}

/// Trims JavaScript whitespace from both ends, as `String.prototype.trim` does.
///
/// Implements: rust-specs/javascript-text-rules
#[must_use]
pub fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_whitespace)
}

/// Trims JavaScript whitespace from the start.
pub(crate) fn js_trim_start(text: &str) -> &str {
    text.trim_start_matches(is_js_whitespace)
}

/// Trims JavaScript whitespace from the end.
pub(crate) fn js_trim_end(text: &str) -> &str {
    text.trim_end_matches(is_js_whitespace)
}

/// Strips `prefix` when the start of `text` equals it ignoring ASCII case.
pub(crate) fn strip_prefix_ci<'a>(text: &'a str, prefix: &str) -> Option<&'a str> {
    let head = text.get(..prefix.len())?;
    if head.eq_ignore_ascii_case(prefix) {
        Some(&text[prefix.len()..])
    } else {
        None
    }
}

/// Removes a closing `[ \t]+#+[ \t]*` run and trims, as TypeScript does.
///
/// Implements: rust-specs/requirement-names
#[must_use]
pub fn normalize_requirement_name(name: &str) -> String {
    let without_hashes = name.trim_end_matches([' ', '\t']);
    let before_hashes = without_hashes.trim_end_matches('#');
    if before_hashes.len() != without_hashes.len() {
        let before_space = before_hashes.trim_end_matches([' ', '\t']);
        if before_space.len() < before_hashes.len() {
            return js_trim(before_space).to_string();
        }
    }
    js_trim(name).to_string()
}

/// Turns every `\r\n` and lone `\r` into `\n`.
pub(crate) fn normalize_line_endings(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

/// Normalizes a living spec or delta: one leading BOM removed, then line endings.
pub(crate) fn normalize_document(text: &str) -> String {
    normalize_line_endings(text.strip_prefix('\u{feff}').unwrap_or(text))
}

/// The marker and length of a code fence opening on this line, if any.
fn fence_opening(line: &str) -> Option<(char, usize)> {
    let rest = js_trim_start(line);
    let marker = rest.chars().next()?;
    if marker != '`' && marker != '~' {
        return None;
    }
    let length = rest.chars().take_while(|c| *c == marker).count();
    if length >= 3 {
        Some((marker, length))
    } else {
        None
    }
}

/// True when this line closes the fence opened with `marker` and `length`.
fn fence_closing(line: &str, marker: char, length: usize) -> bool {
    let trimmed = js_trim(line);
    let count = trimmed.chars().take_while(|c| *c == marker).count();
    count == trimmed.chars().count() && count >= length
}

/// Marks every line that sits inside a code fence.
pub(crate) fn fence_mask(lines: &[&str]) -> Vec<bool> {
    let mut mask = Vec::with_capacity(lines.len());
    let mut active: Option<(char, usize)> = None;
    for line in lines {
        if let Some((marker, length)) = active {
            mask.push(true);
            if fence_closing(line, marker, length) {
                active = None;
            }
        } else if let Some(opening) = fence_opening(line) {
            mask.push(true);
            active = Some(opening);
        } else {
            mask.push(false);
        }
    }
    mask
}

/// True for a `##` heading line: two hashes, then whitespace.
pub(crate) fn is_top_level_heading(line: &str) -> bool {
    line.strip_prefix("##")
        .and_then(|rest| rest.chars().next())
        .is_some_and(is_js_whitespace)
}

/// True for a `##`, whitespace, then `title` ignoring case, and nothing else.
pub(crate) fn is_named_heading(line: &str, title: &str) -> bool {
    let Some(rest) = line.strip_prefix("##") else {
        return false;
    };
    let Some(first) = rest.chars().next() else {
        return false;
    };
    if !is_js_whitespace(first) {
        return false;
    }
    js_trim(rest).eq_ignore_ascii_case(title)
}
