//! The pure text leaves storage needs: frontmatter, bodies, Goals and timestamps.
//!
//! Every rule here mirrors TypeScript's `parseFrontmatter` and `extractSection`,
//! and the fixed `YYYY-MM-DDTHH:MM:SS.mmmZ` timestamp osq writes.
//!
//! Implements: rust-storage/text-fields

use osq_kernel_specs::parse_frontmatter;
use yaml_rust2::Yaml;

/// The fixed-form separator bytes, by their offset in a timestamp.
const SEPARATORS: [(usize, u8); 7] = [
    (4, b'-'),
    (7, b'-'),
    (10, b'T'),
    (13, b':'),
    (16, b':'),
    (19, b'.'),
    (23, b'Z'),
];

/// A top-level frontmatter key's string value, or `None` without one.
///
/// Implements: rust-storage/text-fields
#[must_use]
pub fn frontmatter_string(text: &str, key: &str) -> Option<String> {
    let frontmatter = parse_frontmatter(text).ok()?;
    frontmatter
        .data
        .get(&Yaml::String(key.to_owned()))?
        .as_str()
        .map(ToOwned::to_owned)
}

/// The text after the frontmatter, or the whole text without one.
///
/// Implements: rust-storage/text-fields
#[must_use]
pub fn markdown_body(text: &str) -> &str {
    match parse_frontmatter(text) {
        Ok(frontmatter) => &text[text.len() - frontmatter.body.len()..],
        Err(_) => text,
    }
}

/// The trimmed text of the first `## Goal` section, or `None` without one.
///
/// Implements: rust-storage/text-fields
#[must_use]
pub fn goal_section(body: &str) -> Option<String> {
    let (start, end) = goal_span(body)?;
    Some(body[start..end].trim().to_owned())
}

/// The epoch milliseconds of a `YYYY-MM-DDTHH:MM:SS.mmmZ` timestamp.
///
/// Implements: rust-storage/text-fields
#[must_use]
pub fn timestamp_ms(text: &str) -> Option<i64> {
    let bytes = text.as_bytes();
    if bytes.len() != 24 || !has_separators(bytes) {
        return None;
    }
    let year = number(&bytes[0..4])?;
    let month = number(&bytes[5..7])?;
    let day = number(&bytes[8..10])?;
    let hour = number(&bytes[11..13])?;
    let minute = number(&bytes[14..16])?;
    let second = number(&bytes[17..19])?;
    let millis = number(&bytes[20..23])?;
    if !(1..=12).contains(&month) || !(1..=days_in_month(year, month)).contains(&day) {
        return None;
    }
    if hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let days = days_from_civil(year, month, day);
    let seconds = ((days * 24 + hour) * 60 + minute) * 60 + second;
    Some(seconds * 1000 + millis)
}

/// The byte span of the first `## Goal` section, before trimming.
fn goal_span(body: &str) -> Option<(usize, usize)> {
    for (index, _) in body.char_indices() {
        if !body[index..].starts_with("##") {
            continue;
        }
        let after_hashes = index + 2;
        let heading = skip_whitespace(body, after_hashes);
        if heading == after_hashes {
            continue;
        }
        if !body[heading..]
            .get(..4)
            .is_some_and(|word| word.eq_ignore_ascii_case("Goal"))
        {
            continue;
        }
        if let Some(start) = content_start(body, heading + 4) {
            return Some((start, boundary(body, start)));
        }
    }
    None
}

/// The line-start index after the last newline of the whitespace run at `from`.
///
/// The heading's `\s*\n` is greedy, so an empty Goal takes the next heading's
/// own line as its content.
fn content_start(body: &str, from: usize) -> Option<usize> {
    if !starts_whitespace(body, from) {
        return None;
    }
    let run_end = skip_whitespace(body, from);
    body[from..run_end]
        .rfind('\n')
        .map(|offset| from + offset + 1)
}

/// The next `\n##` and space, or the end of the body.
fn boundary(body: &str, from: usize) -> usize {
    for (offset, _) in body[from..].char_indices() {
        let index = from + offset;
        if body[index..].starts_with("\n##") && starts_whitespace(body, index + 3) {
            return index;
        }
    }
    body.len()
}

/// Whether the byte at `index` exists and is whitespace.
fn starts_whitespace(body: &str, index: usize) -> bool {
    body.as_bytes()
        .get(index)
        .is_some_and(u8::is_ascii_whitespace)
}

/// Advances past every whitespace byte, returning the first non-whitespace index.
fn skip_whitespace(body: &str, from: usize) -> usize {
    body[from..]
        .find(|character: char| !character.is_whitespace())
        .map_or(body.len(), |offset| from + offset)
}

/// Whether the fixed-form separators sit where the format puts them.
fn has_separators(bytes: &[u8]) -> bool {
    SEPARATORS
        .iter()
        .all(|(index, expected)| bytes.get(*index) == Some(expected))
}

/// Parses a fixed-width run of ASCII digits.
fn number(bytes: &[u8]) -> Option<i64> {
    let mut value: i64 = 0;
    for byte in bytes {
        if !byte.is_ascii_digit() {
            return None;
        }
        value = value * 10 + i64::from(byte - b'0');
    }
    Some(value)
}

/// The days in a month, with February's leap day.
fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if is_leap(year) => 29,
        _ => 28,
    }
}

/// Whether a year has a February 29.
fn is_leap(year: i64) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

/// Days from 1970-01-01 to a civil date, for non-negative years.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year / 400;
    let year_of_era = year - era * 400;
    let offset = if month > 2 { month - 3 } else { month + 9 };
    let day_of_year = (153 * offset + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}
