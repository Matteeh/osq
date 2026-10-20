//! Pure parsing of one decision record and ordering of parsed records.

use super::{Adr, AppliesTo};
use crate::document::parse_frontmatter;
use crate::markdown::js_trim;
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::fmt::Write as _;
use yaml_rust2::yaml::{Hash, Yaml};

/// Parses one file's text into an ADR, or none when it carries no `status` key.
pub(super) fn parse_adr(
    content: &str,
    number: &str,
    path: &str,
    groups: &BTreeMap<String, String>,
) -> Option<Adr> {
    let frontmatter = parse_frontmatter(content).ok()?;
    let data = &frontmatter.data;
    let status = lookup(data, "status")?;
    let mut malformed = Vec::new();
    let checks = read_checks(data, &mut malformed);
    let denies = read_list_field(data, "denies", &mut malformed);
    let enforced_by = read_enforced_by(data, &mut malformed);
    let applies_to = read_applies_to(lookup(data, "applies_to"));
    let governs = resolve_governs(applies_to.as_ref(), groups);
    Some(Adr {
        number: number.to_string(),
        title: read_title(&frontmatter.body),
        date: read_date(&frontmatter.body),
        path: path.to_string(),
        hash: hash_content(content),
        status: read_status(status),
        applies_to,
        governs,
        rule: read_rule(lookup(data, "rule")),
        superseded_by: read_superseded_by(lookup(data, "superseded_by")),
        checks,
        denies,
        enforced_by,
        malformed,
    })
}

/// Orders ADRs by the numeric value of their number, then by path.
pub(super) fn compare_adrs(left: &Adr, right: &Adr) -> Ordering {
    compare_numbers(&left.number, &right.number).then_with(|| left.path.cmp(&right.path))
}

/// Compares two written numbers by numeric value without overflowing.
fn compare_numbers(left: &str, right: &str) -> Ordering {
    let left = left.trim_start_matches('0');
    let right = right.trim_start_matches('0');
    left.len().cmp(&right.len()).then_with(|| left.cmp(right))
}

/// Looks up a top-level key in a YAML mapping.
fn lookup<'a>(mapping: &'a Hash, key: &str) -> Option<&'a Yaml> {
    mapping.get(&Yaml::String(key.to_string()))
}

/// The first `#` heading's text without its leading number and dot.
fn read_title(body: &str) -> String {
    for line in body.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        let Some(rest) = line.strip_prefix('#') else {
            continue;
        };
        let Some(rest) = rest.strip_prefix(' ').or_else(|| rest.strip_prefix('\t')) else {
            continue;
        };
        let text = js_trim(rest);
        if !text.is_empty() {
            return strip_number(text);
        }
    }
    String::new()
}

/// Removes a leading run of digits, its dot and the whitespace after it.
fn strip_number(text: &str) -> String {
    let digits = text.chars().take_while(char::is_ascii_digit).count();
    if digits == 0 {
        return text.to_string();
    }
    match text[digits..].strip_prefix('.') {
        Some(rest) => js_trim(rest).to_string(),
        None => text.to_string(),
    }
}

/// The first `YYYY-MM-DD` on the first body line starting with `Date:`.
fn read_date(body: &str) -> Option<String> {
    for line in body.split('\n') {
        if line.starts_with("Date:") {
            return find_date(line);
        }
    }
    None
}

/// The first `YYYY-MM-DD` of ASCII digits in a line.
fn find_date(line: &str) -> Option<String> {
    let bytes = line.as_bytes();
    bytes
        .windows(10)
        .position(is_date)
        .map(|index| line[index..index + 10].to_string())
}

/// True when a ten-byte window is `YYYY-MM-DD` with ASCII digits.
fn is_date(window: &[u8]) -> bool {
    window[..4].iter().all(u8::is_ascii_digit)
        && window[4] == b'-'
        && window[5..7].iter().all(u8::is_ascii_digit)
        && window[7] == b'-'
        && window[8..10].iter().all(u8::is_ascii_digit)
}

/// The `status` as text: trimmed strings, numbers and booleans, else empty.
fn read_status(value: &Yaml) -> String {
    match value {
        Yaml::String(text) | Yaml::Real(text) => js_trim(text).to_string(),
        Yaml::Integer(number) => number.to_string(),
        Yaml::Boolean(flag) => flag.to_string(),
        _ => String::new(),
    }
}

/// The `applies_to` value: exactly `all`, or a list of non-empty strings.
fn read_applies_to(value: Option<&Yaml>) -> Option<AppliesTo> {
    match value {
        Some(Yaml::String(text)) if text == "all" => Some(AppliesTo::All),
        Some(Yaml::Array(items)) if !items.is_empty() => {
            let names = string_items(value?)?;
            Some(AppliesTo::Capabilities(names))
        }
        _ => None,
    }
}

/// The trimmed `rule`, or empty text for any other value.
fn read_rule(value: Option<&Yaml>) -> String {
    match value {
        Some(Yaml::String(text)) => js_trim(text).to_string(),
        _ => String::new(),
    }
}

/// `superseded_by` as a trimmed non-empty string or an integer's text.
fn read_superseded_by(value: Option<&Yaml>) -> Option<String> {
    match value {
        Some(Yaml::String(text)) if !js_trim(text).is_empty() => Some(js_trim(text).to_string()),
        Some(Yaml::Integer(number)) => Some(number.to_string()),
        _ => None,
    }
}

/// The `checks` paths, normalized, or empty and malformed when present wrongly.
fn read_checks(data: &Hash, malformed: &mut Vec<String>) -> Vec<String> {
    let Some(value) = lookup(data, "checks") else {
        return Vec::new();
    };
    let Some(items) = string_items(value) else {
        malformed.push("checks".to_string());
        return Vec::new();
    };
    items
        .into_iter()
        .map(|item| normalize_check(&item))
        .collect()
}

/// A present list field of trimmed strings, or empty plus a malformed name.
fn read_list_field(data: &Hash, key: &str, malformed: &mut Vec<String>) -> Vec<String> {
    let Some(value) = lookup(data, key) else {
        return Vec::new();
    };
    let Some(items) = string_items(value) else {
        malformed.push(key.to_string());
        return Vec::new();
    };
    items
}

/// `enforced_by` as a one-item string list or a list, else empty and malformed.
fn read_enforced_by(data: &Hash, malformed: &mut Vec<String>) -> Vec<String> {
    match lookup(data, "enforced_by") {
        None => Vec::new(),
        Some(Yaml::String(text)) if !js_trim(text).is_empty() => {
            vec![js_trim(text).to_string()]
        }
        Some(value) => {
            let Some(items) = string_items(value) else {
                malformed.push("enforced_by".to_string());
                return Vec::new();
            };
            items
        }
    }
}

/// A YAML array's non-empty string items, each trimmed; anything else is none.
fn string_items(value: &Yaml) -> Option<Vec<String>> {
    let Yaml::Array(items) = value else {
        return None;
    };
    let mut values = Vec::with_capacity(items.len());
    for item in items {
        let Yaml::String(text) = item else {
            return None;
        };
        let text = js_trim(text);
        if text.is_empty() {
            return None;
        }
        values.push(text.to_string());
    }
    Some(values)
}

/// A check path with backslashes turned into `/` and one leading `./` removed.
fn normalize_check(value: &str) -> String {
    let path = value.replace('\\', "/");
    path.strip_prefix("./").unwrap_or(&path).to_string()
}

/// `applies_to` with each `group:<name>` entry resolved to its capabilities.
fn resolve_governs(applies_to: Option<&AppliesTo>, groups: &BTreeMap<String, String>) -> AppliesTo {
    let Some(AppliesTo::Capabilities(entries)) = applies_to else {
        return match applies_to {
            Some(AppliesTo::All) => AppliesTo::All,
            _ => AppliesTo::Capabilities(Vec::new()),
        };
    };
    let mut names = Vec::new();
    for entry in entries {
        match entry
            .strip_prefix("group:")
            .filter(|group| !group.is_empty())
        {
            Some(group) => {
                for (capability, capability_group) in groups {
                    if capability_group == group {
                        names.push(capability.clone());
                    }
                }
            }
            None => names.push(entry.clone()),
        }
    }
    names.sort();
    names.dedup();
    AppliesTo::Capabilities(names)
}

/// `sha256:` and the lowercase hex SHA-256 digest of the text's bytes.
fn hash_content(content: &str) -> String {
    let digest = Sha256::digest(content.as_bytes());
    let mut hex = String::with_capacity(64);
    for byte in digest {
        let _ = write!(hex, "{byte:02x}");
    }
    format!("sha256:{hex}")
}
