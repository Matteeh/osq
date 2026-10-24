//! Reading one named `##` Markdown section from a body.

use super::text::{is_js_whitespace, js_trim};

/// The end of a section body: the newline before the next top-level heading.
fn section_end(capture: &str) -> Option<usize> {
    for (index, _) in capture.match_indices('\n') {
        let rest = &capture[index.saturating_add(1)..];
        if let Some(after) = rest.strip_prefix("##")
            && after.chars().next().is_some_and(is_js_whitespace)
        {
            return Some(index);
        }
    }
    None
}

/// The number of leading JavaScript whitespace characters in bytes.
fn whitespace_len(text: &str) -> usize {
    text.chars()
        .take_while(|c| is_js_whitespace(*c))
        .map(char::len_utf8)
        .sum()
}

/// Reads the trimmed text of the first `## <heading>` section in `body`.
///
/// Implements: rust-specs/markdown-sections
#[must_use]
pub fn section(body: &str, heading: &str) -> String {
    for (start, _) in body.char_indices() {
        if !body[start..].starts_with("##") {
            continue;
        }
        let after_hashes = &body[start.saturating_add(2)..];
        let before_heading = whitespace_len(after_hashes);
        if before_heading == 0 {
            continue;
        }
        let after_ws = &after_hashes[before_heading..];
        let Some(head) = after_ws.get(..heading.len()) else {
            continue;
        };
        if !head.eq_ignore_ascii_case(heading) {
            continue;
        }
        let tail = &after_ws[heading.len()..];
        let after_heading = whitespace_len(tail);
        let run = &tail[..after_heading];
        let Some(last_newline) = run.rfind('\n') else {
            continue;
        };
        let Some(capture) = tail
            .get(last_newline..)
            .and_then(|text| text.strip_prefix('\n'))
        else {
            continue;
        };
        let end = section_end(capture).unwrap_or(capture.len());
        return js_trim(&capture[..end]).to_string();
    }
    String::new()
}
