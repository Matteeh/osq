//! Parsing of an `osq.yml` capability sidecar.

use super::types::{Sidecar, SidecarError, SyntaxError};
use super::yaml::{is_non_empty_string, key_is, key_text, lookup, string_text};
use crate::markdown::text::js_trim;
use yaml_rust2::YamlLoader;
use yaml_rust2::yaml::Yaml;

/// The problem an empty or non-mapping sidecar reports.
const NOT_A_MAPPING: &str = "not a YAML mapping";
/// The problem a missing or blank group reports.
const GROUP_PROBLEM: &str = "group must be a non-empty string";
/// The problem tags that are not non-empty strings report.
const TAGS_PROBLEM: &str = "tags must be a list of non-empty strings";

/// Parses an `osq.yml` sidecar into its group and tags, or into its problems.
///
/// # Errors
///
/// Returns a `SidecarError` when the YAML does not parse, is not a mapping, or
/// its fields are wrong.
///
/// Implements: rust-specs/sidecars
pub fn parse_sidecar(text: &str) -> Result<Sidecar, SidecarError> {
    let documents = YamlLoader::load_from_str(text).map_err(|error| {
        SidecarError::Syntax(SyntaxError {
            line: error.marker().line(),
            message: error.to_string(),
        })
    })?;
    let Some(Yaml::Hash(mapping)) = documents.into_iter().next() else {
        return Err(SidecarError::Problems(vec![NOT_A_MAPPING.to_string()]));
    };

    let mut problems = Vec::new();
    let group = match lookup(&mapping, "group") {
        Some(Yaml::String(text)) if !js_trim(text).is_empty() => js_trim(text).to_string(),
        _ => {
            problems.push(GROUP_PROBLEM.to_string());
            String::new()
        }
    };
    let tags = match lookup(&mapping, "tags") {
        None => None,
        Some(Yaml::Array(items)) if items.iter().all(is_non_empty_string) => {
            Some(items.iter().map(string_text).collect())
        }
        Some(_) => {
            problems.push(TAGS_PROBLEM.to_string());
            None
        }
    };
    for (key, _) in &mapping {
        if !key_is(key, "group") && !key_is(key, "tags") {
            problems.push(format!("unknown key {}", key_text(key)));
        }
    }

    if problems.is_empty() {
        Ok(Sidecar { group, tags })
    } else {
        Err(SidecarError::Problems(problems))
    }
}
