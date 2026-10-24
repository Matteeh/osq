//! The JSON land view of one archived change.

use osq_kernel_vcs::DiffStat;

use crate::archived::View;

use super::value::Value;

/// One archived change's land view object.
/// Implements: rust-show/show-json
pub(super) fn value(view: &View) -> Value {
    Value::object(vec![
        ("folderName", Value::string(view.folder.clone())),
        ("landed", optional_bool(view.landed)),
        (
            "defaultBranch",
            optional_string(view.default_branch.as_deref()),
        ),
        (
            "mainCommits",
            optional_number(view.main_commits.map(unsigned)),
        ),
        ("gates", gates(view)),
        ("diff", diff(view.diff)),
        ("capabilities", capabilities(view)),
        ("disclosures", disclosures(view)),
        ("halt", halt(view)),
        ("lastSync", last_sync(view)),
        ("lastSyncStop", last_sync_stop(view)),
    ])
}

/// The gate runs osq recorded while archiving the change.
/// Implements: rust-show/show-json
fn gates(view: &View) -> Value {
    Value::Array(
        view.gates
            .iter()
            .map(|gate| {
                Value::object(vec![
                    ("kind", Value::string(gate.kind)),
                    ("task", optional_string(gate.task.as_deref())),
                    ("command", Value::string(gate.command.clone())),
                    ("outcome", Value::string(gate.outcome.clone())),
                    ("exitCode", optional_number(gate.exit_code)),
                    ("durationSeconds", optional_number(gate.duration)),
                    ("timestamp", Value::string(gate.timestamp.clone())),
                    ("findings", optional_number(gate.findings.map(count))),
                ])
            })
            .collect(),
    )
}

/// The diff stat, or `null` when the change has no branch or git is off.
/// Implements: rust-show/show-json
fn diff(diff: Option<DiffStat>) -> Value {
    diff.map_or(Value::Null, |diff| {
        Value::object(vec![
            ("files", Value::number(unsigned(diff.files))),
            ("added", Value::number(unsigned(diff.added))),
            ("removed", Value::number(unsigned(diff.removed))),
        ])
    })
}

/// The delta capabilities with their requirement names.
/// Implements: rust-show/show-json
fn capabilities(view: &View) -> Value {
    Value::Array(
        view.capabilities
            .iter()
            .map(|capability| {
                Value::object(vec![
                    ("name", Value::string(capability.name.clone())),
                    ("added", Value::strings(&capability.added)),
                    ("modified", Value::strings(&capability.modified)),
                    ("removed", Value::strings(&capability.removed)),
                    (
                        "renamed",
                        Value::Array(
                            capability
                                .renamed
                                .iter()
                                .map(|rename| {
                                    Value::object(vec![
                                        ("from", Value::string(rename.from.clone())),
                                        ("to", Value::string(rename.to.clone())),
                                    ])
                                })
                                .collect(),
                        ),
                    ),
                ])
            })
            .collect(),
    )
}

/// The result files with a real deviated or outside-scope section.
/// Implements: rust-show/show-json
fn disclosures(view: &View) -> Value {
    Value::Array(
        view.disclosures
            .iter()
            .map(|disclosure| {
                Value::object(vec![
                    ("task", Value::string(disclosure.task.clone())),
                    ("deviated", optional_string(disclosure.deviated.as_deref())),
                    (
                        "outsideScope",
                        optional_string(disclosure.outside_scope.as_deref()),
                    ),
                ])
            })
            .collect(),
    )
}

/// The change-level halt marker, or `null` when there is none.
/// Implements: rust-show/show-json
fn halt(view: &View) -> Value {
    view.halt.as_ref().map_or(Value::Null, |halt| {
        Value::object(vec![
            ("reason", optional_string(halt.reason.as_deref())),
            ("message", Value::string(halt.message.clone())),
        ])
    })
}

/// The last completed sync, or `null` when there is none.
/// Implements: rust-show/show-json
fn last_sync(view: &View) -> Value {
    view.sync.last_sync.as_ref().map_or(Value::Null, |sync| {
        Value::object(vec![
            ("timestamp", Value::string(sync.timestamp.clone())),
            ("defaultBranch", Value::string(sync.default_branch.clone())),
            ("commits", Value::number(sync.commits)),
        ])
    })
}

/// The stop after the last sync, or `null` when there is none.
/// Implements: rust-show/show-json
fn last_sync_stop(view: &View) -> Value {
    view.sync.stop.as_ref().map_or(Value::Null, |stop| {
        Value::object(vec![
            ("timestamp", Value::string(stop.timestamp.clone())),
            ("reason", Value::string(stop.reason.clone())),
            ("message", Value::string(stop.message.clone())),
        ])
    })
}

/// An unsigned count as JavaScript prints its 64-bit float.
fn unsigned(value: u64) -> f64 {
    serde_json::Number::from(value).as_f64().unwrap_or_default()
}

/// A finding count as JavaScript prints its 64-bit float.
fn count(value: usize) -> f64 {
    u64::try_from(value).map_or(0.0, unsigned)
}

/// A string value, or `null`.
fn optional_string(value: Option<&str>) -> Value {
    value.map_or(Value::Null, Value::string)
}

/// A number value, or `null`.
fn optional_number(value: Option<f64>) -> Value {
    value.map_or(Value::Null, Value::number)
}

/// A boolean value, or `null`.
fn optional_bool(value: Option<bool>) -> Value {
    value.map_or(Value::Null, Value::Bool)
}
