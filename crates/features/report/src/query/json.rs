//! The JSON form of one query result, as TypeScript's `JSON.stringify` writes it.

use std::fmt::Write as _;

use rusqlite::types::ValueRef;

use super::text;

/// The largest column name JavaScript treats as an array index.
const MAX_INDEX: u64 = 4_294_967_294;

/// One value's JSON text.
///
/// Implements: rust-report/query-json-values
/// Implements: rust-report/query-json-strings
pub(super) fn value_text(value: ValueRef<'_>, root: &str, home: &str) -> String {
    match value {
        ValueRef::Null => "null".to_owned(),
        ValueRef::Integer(number) => number.to_string(),
        ValueRef::Real(number) => real_text(number),
        ValueRef::Blob(bytes) => blob_text(bytes),
        ValueRef::Text(bytes) => {
            let text = String::from_utf8_lossy(bytes);
            string_text(&text::rewrite_paths(&text, root, home))
        }
    }
}

/// One blob as an object of byte positions and decimal byte values.
///
/// Implements: rust-report/query-json-values
fn blob_text(bytes: &[u8]) -> String {
    let mut out = String::from("{");
    for (index, byte) in bytes.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        write!(out, "\"{index}\":{byte}").expect("writing to a string cannot fail");
    }
    out.push('}');
    out
}

/// One row's JSON object with its keys in JavaScript's own-property order.
///
/// Implements: rust-report/query-json-keys
/// Implements: rust-report/query-json-strings
pub(super) fn object_text(columns: &[String], values: &[String]) -> String {
    let mut entries: Vec<(&str, &str)> = Vec::with_capacity(columns.len());
    for (column, value) in columns.iter().zip(values) {
        if let Some(entry) = entries.iter_mut().find(|(name, _)| name == column) {
            entry.1 = value;
        } else {
            entries.push((column, value));
        }
    }
    let (mut indexes, others): (Vec<_>, Vec<_>) = entries
        .into_iter()
        .partition(|(name, _)| array_index(name).is_some());
    indexes.sort_by_key(|(name, _)| array_index(name));
    let mut out = String::from("{");
    for (position, (name, value)) in indexes.iter().chain(&others).enumerate() {
        if position > 0 {
            out.push(',');
        }
        out.push_str(&string_text(name));
        out.push(':');
        out.push_str(value);
    }
    out.push('}');
    out
}

/// The number of a column name that is a canonical array index.
///
/// Implements: rust-report/query-json-keys
fn array_index(name: &str) -> Option<u32> {
    let value = name.parse::<u64>().ok()?;
    if value > MAX_INDEX || value.to_string() != name {
        return None;
    }
    u32::try_from(value).ok()
}

/// One real as ECMAScript's `Number::toString` writes it.
///
/// Implements: rust-report/query-json-reals
pub(crate) fn real_text(value: f64) -> String {
    if !value.is_finite() {
        return "null".to_owned();
    }
    let negative = value < 0.0;
    let scientific = format!("{:e}", value.abs());
    let (mantissa, exponent) = scientific
        .split_once('e')
        .expect("a lower exponential number holds an exponent");
    let digits = mantissa.replace('.', "");
    let length = i32::try_from(digits.len()).expect("a number's digits fit in an i32");
    let n = exponent
        .parse::<i32>()
        .expect("a lower exponential exponent is an integer")
        + 1;
    let mut out = String::new();
    if negative {
        out.push('-');
    }
    if (-5..=21).contains(&n) {
        if n <= 0 {
            out.push_str("0.");
            for _ in 0..-n {
                out.push('0');
            }
            out.push_str(&digits);
        } else if n >= length {
            out.push_str(&digits);
            for _ in 0..n - length {
                out.push('0');
            }
        } else {
            let split = usize::try_from(n).expect("a positive n fits in a usize");
            out.push_str(&digits[..split]);
            out.push('.');
            out.push_str(&digits[split..]);
        }
    } else {
        out.push_str(&digits[..1]);
        if digits.len() > 1 {
            out.push('.');
            out.push_str(&digits[1..]);
        }
        out.push('e');
        let exponent = n - 1;
        if exponent >= 0 {
            out.push('+');
        }
        out.push_str(&exponent.to_string());
    }
    out
}

/// One JSON string as `JSON.stringify` writes it.
///
/// Implements: rust-report/query-json-strings
pub(crate) fn string_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for character in text.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\t' => out.push_str("\\t"),
            '\n' => out.push_str("\\n"),
            '\u{c}' => out.push_str("\\f"),
            '\r' => out.push_str("\\r"),
            other if u32::from(other) < 0x20 => {
                write!(out, "\\u{:04x}", u32::from(other))
                    .expect("writing to a string cannot fail");
            }
            other => out.push(other),
        }
    }
    out.push('"');
    out
}
