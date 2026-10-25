//! Counting task event files and the living capabilities' sidecars.
//!
//! Implements: rust-report/report-coverage

use std::collections::BTreeMap;
use std::path::Path;

use osq_kernel_storage::{
    CapabilitySidecars, ChangeEntry, Location, read_capability_sidecars, read_task_event_files,
};
use serde_json::{Map, Value, json};

use super::js_number;
use super::order::compare_numeric_prefix;

/// One change's task ids split by whether each has an event file.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct ChangeCoverage {
    /// The task ids holding an event file.
    pub(crate) with_events: Vec<String>,
    /// The task ids without an event file.
    pub(crate) without_events: Vec<String>,
}

/// Every counted change's task event files and the capability sidecar split.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct Coverage {
    /// The number of tasks holding an event file.
    pub(crate) with_events: u64,
    /// The number of tasks without an event file.
    pub(crate) without_events: u64,
    /// One entry per change folder holding at least one task file.
    pub(crate) by_change: BTreeMap<String, ChangeCoverage>,
    /// The living capabilities' sidecar split, or none without a capability.
    pub(crate) capabilities: Option<CapabilitySidecars>,
}

/// Reads every counted change's task event files and the root's sidecars.
///
/// Implements: rust-report/report-coverage
pub(crate) fn read(entries: &[ChangeEntry], root: &Path) -> Coverage {
    let mut coverage = Coverage {
        capabilities: read_capability_sidecars(root),
        ..Coverage::default()
    };
    for entry in entries {
        if entry.location == Location::Rejected {
            continue;
        }
        let files = read_task_event_files(&entry.path);
        if files.is_empty() {
            continue;
        }
        let mut change = ChangeCoverage::default();
        for file in files {
            if file.events {
                coverage.with_events += 1;
                change.with_events.push(file.id);
            } else {
                coverage.without_events += 1;
                change.without_events.push(file.id);
            }
        }
        change
            .with_events
            .sort_by(|left, right| compare_numeric_prefix(left, right));
        change
            .without_events
            .sort_by(|left, right| compare_numeric_prefix(left, right));
        coverage.by_change.insert(entry.folder.clone(), change);
    }
    coverage
}

/// Writes the `Coverage:` lines, without a trailing newline.
///
/// Implements: rust-report/report-coverage
pub(crate) fn text(coverage: &Coverage) -> Vec<String> {
    vec![
        "Coverage:".to_owned(),
        format!("  Tasks with event files: {}", coverage.with_events),
        format!("  Tasks without event files: {}", coverage.without_events),
    ]
}

/// Writes the `coverage` member as `serializeSortedJson` writes it.
///
/// Implements: rust-report/report-coverage
pub(crate) fn json(coverage: &Coverage) -> Value {
    let mut by_change = Map::new();
    for (name, entry) in &coverage.by_change {
        by_change.insert(
            name.clone(),
            json!({
                "withEvents": &entry.with_events,
                "withoutEvents": &entry.without_events,
            }),
        );
    }
    let mut report = Map::new();
    report.insert("byChange".to_owned(), Value::Object(by_change));
    if let Some(capabilities) = &coverage.capabilities {
        report.insert(
            "capabilities".to_owned(),
            json!({
                "withSidecar": &capabilities.with_sidecar,
                "withoutSidecar": &capabilities.without_sidecar,
            }),
        );
    }
    report.insert(
        "withEvents".to_owned(),
        js_number::json_number(whole(coverage.with_events)),
    );
    report.insert(
        "withoutEvents".to_owned(),
        js_number::json_number(whole(coverage.without_events)),
    );
    Value::Object(report)
}

/// A count as the JavaScript number it is written as.
fn whole(value: u64) -> f64 {
    f64::from(u32::try_from(value).unwrap_or(u32::MAX))
}
