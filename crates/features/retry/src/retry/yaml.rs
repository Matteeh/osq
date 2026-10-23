//! Writing a done marker's frontmatter as the `yaml` package's `stringify` does.

use yaml_rust2::Yaml;
use yaml_rust2::yaml::Hash;

/// Writes a mapping and its values as `YAML.stringify` writes a document.
///
/// Implements: rust-retry/recertified-done-marker
pub(crate) fn write(mapping: &Hash) -> String {
    let mut text = String::new();
    mapping_all(mapping, 0, &mut text);
    text
}

/// Writes every mapping entry at `indent`.
///
/// Implements: rust-retry/recertified-done-marker
fn mapping_all(mapping: &Hash, indent: usize, text: &mut String) {
    for (key, value) in mapping {
        push_spaces(indent, text);
        push_key(key, text);
        text.push(':');
        push_value(value, indent, text);
    }
}

/// Writes a mapping item's entries, its first on the caller's line.
///
/// Implements: rust-retry/recertified-done-marker
fn mapping_first(mapping: &Hash, indent: usize, text: &mut String) {
    for (index, (key, value)) in mapping.iter().enumerate() {
        if index > 0 {
            push_spaces(indent, text);
        }
        push_key(key, text);
        text.push(':');
        push_value(value, indent, text);
    }
}

/// Writes a value after its key, as a scalar or a block below it.
///
/// Implements: rust-retry/recertified-done-marker
fn push_value(value: &Yaml, key_indent: usize, text: &mut String) {
    match value {
        Yaml::Hash(mapping) if !mapping.is_empty() => {
            text.push('\n');
            mapping_all(mapping, key_indent + 2, text);
        }
        Yaml::Array(items) if !items.is_empty() => {
            text.push('\n');
            array_all(items, key_indent + 2, text);
        }
        other => {
            text.push(' ');
            text.push_str(&scalar(other));
            text.push('\n');
        }
    }
}

/// Writes every list item at `indent`.
///
/// Implements: rust-retry/recertified-done-marker
fn array_all(items: &[Yaml], indent: usize, text: &mut String) {
    for item in items {
        push_spaces(indent, text);
        text.push_str("- ");
        push_item(item, indent, text);
    }
}

/// Writes a list item's items, its first on the caller's line.
///
/// Implements: rust-retry/recertified-done-marker
fn array_first(items: &[Yaml], indent: usize, text: &mut String) {
    for (index, item) in items.iter().enumerate() {
        if index > 0 {
            push_spaces(indent, text);
        }
        text.push_str("- ");
        push_item(item, indent, text);
    }
}

/// Writes one list item after its dash.
///
/// Implements: rust-retry/recertified-done-marker
fn push_item(item: &Yaml, dash_indent: usize, text: &mut String) {
    match item {
        Yaml::Hash(mapping) if !mapping.is_empty() => {
            mapping_first(mapping, dash_indent + 2, text);
        }
        Yaml::Array(items) if !items.is_empty() => {
            array_first(items, dash_indent + 2, text);
        }
        other => {
            text.push_str(&scalar(other));
            text.push('\n');
        }
    }
}

/// Writes two spaces per indent level.
///
/// Implements: rust-retry/recertified-done-marker
fn push_spaces(indent: usize, text: &mut String) {
    text.push_str(&" ".repeat(indent));
}

/// Writes a mapping key as a string, an integer key as its decimal text.
///
/// Implements: rust-retry/recertified-done-marker
fn push_key(key: &Yaml, text: &mut String) {
    match key {
        Yaml::Integer(value) => text.push_str(&string_value(&value.to_string())),
        Yaml::Boolean(value) => text.push_str(if *value { "true" } else { "false" }),
        Yaml::String(value) | Yaml::Real(value) => text.push_str(&string_value(value)),
        other => text.push_str(&string_value(&scalar(other))),
    }
}

/// Writes a non-empty mapping or list, a scalar, or its empty form.
///
/// Implements: rust-retry/recertified-done-marker
fn scalar(value: &Yaml) -> String {
    match value {
        Yaml::String(text) => string_value(text),
        Yaml::Integer(number) => number.to_string(),
        Yaml::Real(text) => text.clone(),
        Yaml::Boolean(flag) => String::from(if *flag { "true" } else { "false" }),
        Yaml::Null | Yaml::BadValue | Yaml::Alias(_) => "null".to_owned(),
        Yaml::Array(_) => "[]".to_owned(),
        Yaml::Hash(_) => "{}".to_owned(),
    }
}

/// Writes a string plain when the plain set allows it, otherwise as JSON.
///
/// Implements: rust-retry/recertified-done-marker
fn string_value(value: &str) -> String {
    if is_plain(value) {
        value.to_owned()
    } else {
        serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_owned())
    }
}

/// True when the `yaml` package writes a string without quotes.
///
/// Implements: rust-retry/recertified-done-marker
fn is_plain(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_ascii_alphanumeric() || matches!(first, '.' | '_' | '/')) {
        return false;
    }
    if !value.chars().all(|character| {
        character.is_ascii_alphanumeric()
            || matches!(character, '.' | '_' | '/' | '-' | '+' | ':' | '@')
    }) {
        return false;
    }
    !value.ends_with(':') && !is_reserved(value)
}

/// True when a plain-looking string would read as another YAML scalar.
///
/// Implements: rust-retry/recertified-done-marker
fn is_reserved(value: &str) -> bool {
    matches!(
        value,
        "null"
            | "Null"
            | "NULL"
            | "true"
            | "True"
            | "TRUE"
            | "false"
            | "False"
            | "FALSE"
            | ".inf"
            | ".Inf"
            | ".INF"
            | ".nan"
            | ".NaN"
            | ".NAN"
    ) || is_integer(value)
        || is_octal_or_hex(value)
        || is_float(value)
}

/// True for a decimal integer, with an optional sign.
///
/// Implements: rust-retry/recertified-done-marker
fn is_integer(value: &str) -> bool {
    let body = value.strip_prefix(['-', '+']).unwrap_or(value);
    !body.is_empty() && body.bytes().all(|byte| byte.is_ascii_digit())
}

/// True for a `0o` octal or `0x` hex integer, with an optional sign.
///
/// Implements: rust-retry/recertified-done-marker
fn is_octal_or_hex(value: &str) -> bool {
    let body = value.strip_prefix(['-', '+']).unwrap_or(value);
    if let Some(digits) = body.strip_prefix("0o") {
        return !digits.is_empty() && digits.bytes().all(|byte| matches!(byte, b'0'..=b'7'));
    }
    if let Some(digits) = body.strip_prefix("0x") {
        return !digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_hexdigit());
    }
    false
}

/// True for a decimal float with an optional sign, decimal point or exponent.
///
/// Implements: rust-retry/recertified-done-marker
fn is_float(value: &str) -> bool {
    let body = value.strip_prefix(['-', '+']).unwrap_or(value);
    let (mantissa, exponent) = match body.split_once(['e', 'E']) {
        Some((mantissa, exponent)) => (mantissa, Some(exponent)),
        None => (body, None),
    };
    if let Some(exponent) = exponent {
        let digits = exponent.strip_prefix(['-', '+']).unwrap_or(exponent);
        if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
            return false;
        }
    }
    let digits_only =
        |text: &str| !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit());
    match mantissa.split_once('.') {
        Some((whole, fraction)) => {
            (whole.is_empty() || digits_only(whole))
                && (fraction.is_empty() || digits_only(fraction))
                && !(whole.is_empty() && fraction.is_empty())
        }
        None => digits_only(mantissa) && exponent.is_some(),
    }
}
