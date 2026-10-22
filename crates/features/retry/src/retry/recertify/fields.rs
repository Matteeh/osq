//! The regressed marker facts a `recertification` event carries.

use osq_kernel_specs::parse_frontmatter;
use serde_json::{Map, Number, Value};
use yaml_rust2::Yaml;

/// The differing paths and per-path attribution of one regressed marker.
pub(crate) struct Facts {
    /// Each `- ` line of the marker's first body paragraph.
    pub(crate) differing_paths: Vec<String>,
    /// The frontmatter `attribution` list, or an empty list.
    pub(crate) attribution: Value,
}

/// Reads the differing paths and attribution out of a regressed marker.
///
/// Implements: rust-retry/scope-recertification
pub(crate) fn facts(text: &str) -> Facts {
    let empty = || Facts {
        differing_paths: Vec::new(),
        attribution: Value::Array(Vec::new()),
    };
    let Ok(frontmatter) = parse_frontmatter(text) else {
        return empty();
    };
    let paragraph = frontmatter.body.split("\n\n").next().unwrap_or("");
    let differing_paths = paragraph
        .split('\n')
        .filter_map(|line| line.strip_prefix("- "))
        .map(|path| path.trim().to_owned())
        .collect();
    let attribution = match frontmatter
        .data
        .get(&Yaml::String("attribution".to_owned()))
    {
        Some(Yaml::Array(items)) => Value::Array(items.iter().map(json).collect()),
        _ => Value::Array(Vec::new()),
    };
    Facts {
        differing_paths,
        attribution,
    }
}

/// Converts one YAML value into the JSON the event writes.
///
/// Implements: rust-retry/scope-recertification
fn json(value: &Yaml) -> Value {
    match value {
        Yaml::String(text) => Value::String(text.clone()),
        Yaml::Integer(number) => Value::Number(Number::from(*number)),
        Yaml::Real(text) => text
            .parse::<f64>()
            .ok()
            .and_then(Number::from_f64)
            .map_or_else(|| Value::String(text.clone()), Value::Number),
        Yaml::Boolean(flag) => Value::Bool(*flag),
        Yaml::Array(items) => Value::Array(items.iter().map(json).collect()),
        Yaml::Hash(mapping) => {
            let mut object = Map::new();
            for (key, item) in mapping {
                object.insert(key_text(key), json(item));
            }
            Value::Object(object)
        }
        Yaml::Null | Yaml::BadValue | Yaml::Alias(_) => Value::Null,
    }
}

/// One YAML mapping key as a JSON object key.
///
/// Implements: rust-retry/scope-recertification
fn key_text(key: &Yaml) -> String {
    match key {
        Yaml::Integer(number) => number.to_string(),
        Yaml::String(text) | Yaml::Real(text) => text.clone(),
        Yaml::Boolean(flag) => String::from(if *flag { "true" } else { "false" }),
        _ => "null".to_owned(),
    }
}
