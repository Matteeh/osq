//! Reading YAML fields from a parsed frontmatter mapping.

use super::types::SyntaxError;
use crate::markdown::text::js_trim;
use yaml_rust2::YamlLoader;
use yaml_rust2::yaml::{Hash, Yaml};

/// Parses a frontmatter text into its YAML mapping.
///
/// Empty YAML reads as an empty mapping. A YAML error names the line it points
/// at, one past its own line because the opening `---` is line 1.
pub(super) fn parse_mapping(text: &str) -> Result<Hash, SyntaxError> {
    let documents = YamlLoader::load_from_str(text).map_err(|error| SyntaxError {
        line: error.marker().line() + 1,
        message: error.to_string(),
    })?;
    match documents.into_iter().next() {
        None => Ok(Hash::new()),
        Some(Yaml::Hash(mapping)) => Ok(mapping),
        Some(_) => Err(SyntaxError {
            line: 2,
            message: "frontmatter is not a YAML mapping".to_string(),
        }),
    }
}

/// Looks up a top-level string key in a YAML mapping.
pub(super) fn lookup<'a>(mapping: &'a Hash, key: &str) -> Option<&'a Yaml> {
    mapping.get(&Yaml::String(key.to_string()))
}

/// The trimmed text of a YAML string field, or empty text for any other value.
pub(super) fn text_field(mapping: &Hash, key: &str) -> String {
    match lookup(mapping, key) {
        Some(Yaml::String(text)) => js_trim(text).to_string(),
        _ => String::new(),
    }
}

/// A list field's item texts, or empty for a value that is not a list.
pub(super) fn list_field(mapping: &Hash, key: &str) -> Vec<String> {
    list_of(lookup(mapping, key))
}

/// A list value's item texts, or empty for a value that is not a list.
pub(super) fn list_of(value: Option<&Yaml>) -> Vec<String> {
    match value {
        Some(Yaml::Array(items)) => items.iter().map(item_text).collect(),
        _ => Vec::new(),
    }
}

/// The `features.reads` list, or empty when `features` is not a mapping.
pub(super) fn reads_field(mapping: &Hash) -> Vec<String> {
    match lookup(mapping, "features") {
        Some(Yaml::Hash(features)) => list_of(lookup(features, "reads")),
        _ => Vec::new(),
    }
}

/// A change id list: each item's text, a leading-digit one padded to three digits.
pub(super) fn change_ids(mapping: &Hash, key: &str) -> Vec<String> {
    list_field(mapping, key)
        .into_iter()
        .map(pad_change_id)
        .collect()
}

/// Pads a change id that starts with a digit to three digits.
fn pad_change_id(text: String) -> String {
    if !text.starts_with(|character: char| character.is_ascii_digit()) {
        return text;
    }
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    match digits.parse::<u32>() {
        Ok(number) => format!("{number:03}"),
        Err(_) => text,
    }
}

/// One list item's text: a string as written, an integer, a real, a boolean or null.
fn item_text(value: &Yaml) -> String {
    match value {
        Yaml::String(text) | Yaml::Real(text) => js_trim(text).to_string(),
        Yaml::Integer(number) => number.to_string(),
        Yaml::Boolean(flag) => String::from(if *flag { "true" } else { "false" }),
        Yaml::Null => "null".to_string(),
        _ => String::new(),
    }
}

/// True for a string that holds something after trimming.
pub(super) fn is_non_empty_string(value: &Yaml) -> bool {
    matches!(value, Yaml::String(text) if !js_trim(text).is_empty())
}

/// A string item's trimmed text, or empty text for a non-string.
pub(super) fn string_text(value: &Yaml) -> String {
    match value {
        Yaml::String(text) => js_trim(text).to_string(),
        _ => String::new(),
    }
}

/// True for a YAML key that names `wanted`, for the text keys sidecars compare.
pub(super) fn key_is(key: &Yaml, wanted: &str) -> bool {
    key.as_str() == Some(wanted)
}

/// A YAML key's text, as JavaScript reads an object key.
pub(super) fn key_text(key: &Yaml) -> String {
    item_text(key)
}
