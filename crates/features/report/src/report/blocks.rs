//! Gathering and writing the rework, disclosure and dependency blocks.
//!
//! Implements: rust-report/report-history-blocks

use std::collections::BTreeMap;

use osq_kernel_storage::{
    ChangeEntry, DependencyPair, Location, read_change_fixes, read_dependencies_added,
    read_result_disclosures,
};
use serde_json::{Map, Value, json};

use super::order::compare_numeric_prefix;

/// The rework, executor disclosure and added dependency blocks.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Blocks {
    /// Each fixed change and its fixer ids.
    pub(crate) rework: Vec<ReworkEntry>,
    /// Each change holding at least one executor disclosure.
    pub(crate) disclosures: Vec<DisclosureEntry>,
    /// Each change whose tasks added a package.
    pub(crate) dependencies: Vec<DependencyEntry>,
}

/// One fixed change and its distinct fixer ids.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ReworkEntry {
    /// The fixed change id.
    pub(crate) change: String,
    /// The change ids naming it in `fixes`.
    pub(crate) fixed_by: Vec<String>,
}

/// One change with at least one executor disclosure.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct DisclosureEntry {
    /// The change id.
    pub(crate) change: ChangeId,
    /// The result files holding a `## Deviated` section.
    pub(crate) deviated: usize,
    /// The result files holding a `## Missing context` section.
    pub(crate) missing_context: usize,
    /// The result files holding a `## Outside scope` section.
    pub(crate) outside_scope: usize,
}

/// A change id borrowed from an entry's folder name, or owned when padded.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct ChangeId(String);

impl ChangeId {
    /// The id's text.
    fn as_str(&self) -> &str {
        &self.0
    }
}

/// One change and the distinct packages its tasks added.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct DependencyEntry {
    /// The change's folder name.
    pub(crate) change: String,
    /// The distinct packages it added, sorted by file then name.
    pub(crate) added: Vec<DependencyPair>,
}

/// Reads every non-rejected change's rework, disclosures and dependencies.
///
/// Implements: rust-report/report-history-blocks
pub(crate) fn read(entries: &[ChangeEntry]) -> Blocks {
    let mut fixed_by: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut disclosures = Vec::new();
    let mut dependencies = Vec::new();
    for entry in entries {
        if entry.location == Location::Rejected {
            continue;
        }
        let change = ChangeId(change_id(&entry.folder));
        for fixed in read_change_fixes(&entry.path) {
            let fixers = fixed_by.entry(fixed).or_default();
            if !fixers.contains(&change.0) {
                fixers.push(change.0.clone());
            }
        }
        add_disclosure(&mut disclosures, &entry.path, &change);
        let added = read_dependencies_added(&entry.path);
        if !added.is_empty() {
            dependencies.push(DependencyEntry {
                change: entry.folder.clone(),
                added,
            });
        }
    }
    let mut rework: Vec<ReworkEntry> = fixed_by
        .into_iter()
        .map(|(change, mut fixed_by)| {
            fixed_by.sort_by(|left, right| compare_numeric_prefix(left, right));
            ReworkEntry { change, fixed_by }
        })
        .collect();
    rework.sort_by(|left, right| compare_numeric_prefix(&left.change, &right.change));
    disclosures.sort_by(|left, right| left.change.0.cmp(&right.change.0));
    dependencies.sort_by(|left, right| compare_numeric_prefix(&left.change, &right.change));
    Blocks {
        rework,
        disclosures,
        dependencies,
    }
}

/// Adds one change's disclosure counts when it holds any section.
fn add_disclosure(
    disclosures: &mut Vec<DisclosureEntry>,
    folder: &std::path::Path,
    change: &ChangeId,
) {
    let found = read_result_disclosures(folder);
    if found.is_empty() {
        return;
    }
    let mut entry = DisclosureEntry {
        change: change.clone(),
        ..DisclosureEntry::default()
    };
    for disclosure in &found {
        if disclosure.deviated.is_some() {
            entry.deviated += 1;
        }
        if disclosure.missing_context.is_some() {
            entry.missing_context += 1;
        }
        if disclosure.outside_scope.is_some() {
            entry.outside_scope += 1;
        }
    }
    disclosures.push(entry);
}

/// The three blocks' text lines, in TypeScript's order.
///
/// Implements: rust-report/report-history-blocks
pub(crate) fn text(blocks: &Blocks) -> Vec<String> {
    let mut lines = vec!["Rework:".to_owned()];
    if blocks.rework.is_empty() {
        lines.push("  (none)".to_owned());
    } else {
        for entry in &blocks.rework {
            lines.push(format!(
                "  {}: fixed by {}",
                entry.change,
                entry.fixed_by.join(", ")
            ));
        }
    }
    lines.push("Executor disclosures:".to_owned());
    if blocks.disclosures.is_empty() {
        lines.push("  (none)".to_owned());
    } else {
        for entry in &blocks.disclosures {
            lines.push(format!(
                "  {}: deviated {}, missing context {}, outside scope {}",
                entry.change.as_str(),
                entry.deviated,
                entry.missing_context,
                entry.outside_scope
            ));
        }
    }
    if !blocks.dependencies.is_empty() {
        lines.push("Dependencies added:".to_owned());
        for entry in &blocks.dependencies {
            let pairs: Vec<String> = entry
                .added
                .iter()
                .map(|pair| format!("{} ({})", pair.name, pair.file))
                .collect();
            lines.push(format!("  {}: {}", entry.change, pairs.join(", ")));
        }
    }
    lines
}

/// The three blocks' JSON members, leaving empty blocks out.
///
/// Implements: rust-report/report-history-blocks
pub(crate) fn json(blocks: &Blocks) -> Map<String, Value> {
    let mut members = Map::new();
    if !blocks.rework.is_empty() {
        let rows: Vec<Value> = blocks
            .rework
            .iter()
            .map(|entry| json!({"change": entry.change, "fixedBy": entry.fixed_by}))
            .collect();
        members.insert("rework".to_owned(), Value::Array(rows));
    }
    if !blocks.disclosures.is_empty() {
        let rows: Vec<Value> = blocks
            .disclosures
            .iter()
            .map(|entry| {
                json!({
                    "change": entry.change.as_str(),
                    "deviated": entry.deviated,
                    "missingContext": entry.missing_context,
                    "outsideScope": entry.outside_scope,
                })
            })
            .collect();
        members.insert("disclosures".to_owned(), Value::Array(rows));
    }
    if !blocks.dependencies.is_empty() {
        let rows: Vec<Value> = blocks
            .dependencies
            .iter()
            .map(|entry| {
                let added: Vec<Value> = entry
                    .added
                    .iter()
                    .map(|pair| json!({"file": pair.file, "name": pair.name}))
                    .collect();
                json!({"change": entry.change, "added": added})
            })
            .collect();
        members.insert("dependencies".to_owned(), Value::Array(rows));
    }
    members
}

/// A change's id: its leading digits padded to three, or its whole folder name.
fn change_id(folder: &str) -> String {
    let digits: String = folder.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        folder.to_owned()
    } else {
        format!("{digits:0>3}")
    }
}
