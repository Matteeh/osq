//! The rejected-change part of the status overview.

use std::fs;

use osq_kernel_specs::parse_frontmatter;
use osq_kernel_storage::{ChangeEntry, Location};
use yaml_rust2::Yaml;

use crate::facts::Facts;
use crate::model;

use super::found;

/// The `Rejected specs:` block, in listing order.
///
/// Implements: rust-show/status-text-equals-typescript-s
pub(crate) fn lines(facts: &Facts) -> Vec<String> {
    let rejected: Vec<&ChangeEntry> = facts
        .entries()
        .iter()
        .filter(|entry| entry.location == Location::Rejected)
        .collect();
    let mut lines = vec![String::new(), "Rejected specs:".to_owned()];
    if rejected.is_empty() {
        lines.push("  (none)".to_owned());
        return lines;
    }
    for entry in rejected {
        let (reason, timestamp) = marker(entry);
        lines.push(format!(
            "{}: {} [rejected] (reason: {}, at: {})",
            entry.folder,
            title(entry, facts),
            reason.unwrap_or_else(|| "unavailable".to_owned()),
            timestamp.unwrap_or_else(|| "unavailable".to_owned())
        ));
    }
    lines
}

/// A rejected change's title, falling back to its folder name.
fn title(entry: &ChangeEntry, facts: &Facts) -> String {
    let title = model::read(&found(entry), facts, None)
        .map_or_else(|_| String::new(), |change| change.title);
    if title.is_empty() {
        entry.folder.clone()
    } else {
        title
    }
}

/// The rejection marker's trimmed reason and timestamp.
fn marker(entry: &ChangeEntry) -> (Option<String>, Option<String>) {
    let path = entry.path.join(".run").join("rejected.md");
    let Ok(text) = fs::read_to_string(path) else {
        return (None, None);
    };
    let Ok(frontmatter) = parse_frontmatter(&text) else {
        return (None, None);
    };
    (
        string_field(&frontmatter.data, "reason"),
        string_field(&frontmatter.data, "timestamp"),
    )
}

/// A frontmatter field's trimmed non-empty string value.
fn string_field(data: &yaml_rust2::yaml::Hash, key: &str) -> Option<String> {
    data.get(&Yaml::String(key.to_owned()))?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
