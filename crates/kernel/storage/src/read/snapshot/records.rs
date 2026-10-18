//! Reading `.run/plan.jsonl` and the manifest's `notices` record.
//!
//! Implements: rust-storage/plan-records
//! Implements: rust-storage/manifest-notices

use serde_json::Value;

/// One notice: its id and severity, as written.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Notice {
    /// The notice id.
    pub id: String,
    /// The severity, as written.
    pub severity: String,
}

/// One link finding of a plan record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LinkEntry {
    /// The finding's severity.
    pub severity: String,
    /// The file the finding names.
    pub file: String,
    /// The finding's message.
    pub message: String,
}

/// One `plan_ready` record of `.run/plan.jsonl`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlanRecord {
    /// The record's notices, in order.
    pub notices: Vec<Notice>,
    /// The link findings, absent without a `traceability` array.
    pub traceability: Option<Vec<LinkEntry>>,
}

/// The manifest's `notices` record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ManifestNotices {
    /// The kept notice items, in order.
    pub items: Vec<Notice>,
    /// The opened ids, absent when `opened` is not an array.
    pub opened: Option<Vec<String>>,
}

/// The `plan_ready` records of a `plan.jsonl` text, in file order.
pub(super) fn plan_records(text: &str) -> Vec<PlanRecord> {
    text.lines().filter_map(plan_record).collect()
}

/// One line as a plan record, or `None` when it is not one.
fn plan_record(line: &str) -> Option<PlanRecord> {
    let value: Value = serde_json::from_str(line).ok()?;
    let object = value.as_object()?;
    if object.get("type")?.as_str()? != "plan_ready" {
        return None;
    }
    if object.get("timestamp")?.as_str()?.is_empty() {
        return None;
    }
    let data = object.get("data")?.as_object()?;
    data.get("hash")?.as_str()?;
    let notices = plan_notices(data.get("notices")?.as_array()?)?;
    let traceability = data
        .get("traceability")
        .and_then(Value::as_array)
        .map(|entries| entries.iter().filter_map(link_entry).collect());
    Some(PlanRecord {
        notices,
        traceability,
    })
}

/// The notices of a plan record, or `None` when one entry is not a plain notice.
fn plan_notices(entries: &[Value]) -> Option<Vec<Notice>> {
    entries.iter().map(plan_notice).collect()
}

/// One plan notice, or `None` when its id, severity or folded flag is wrong.
fn plan_notice(value: &Value) -> Option<Notice> {
    let object = value.as_object()?;
    let id = object.get("id")?.as_str()?;
    let severity = object.get("severity")?.as_str()?;
    if !matches!(severity, "red" | "amber" | "grey") {
        return None;
    }
    if !object.get("folded").is_some_and(Value::is_boolean) {
        return None;
    }
    Some(Notice {
        id: id.to_owned(),
        severity: severity.to_owned(),
    })
}

/// One link finding, or `None` when a string field is missing.
fn link_entry(value: &Value) -> Option<LinkEntry> {
    let object = value.as_object()?;
    Some(LinkEntry {
        severity: object.get("severity")?.as_str()?.to_owned(),
        file: object.get("file")?.as_str()?.to_owned(),
        message: object.get("message")?.as_str()?.to_owned(),
    })
}

/// The manifest's notices record, or `None` when it is absent or malformed.
pub(super) fn manifest_notices(manifest: Option<&Value>) -> Option<ManifestNotices> {
    let record = manifest?.get("notices")?;
    let items = record.get("items")?.as_array()?;
    Some(ManifestNotices {
        items: items.iter().filter_map(manifest_notice).collect(),
        opened: record.get("opened").and_then(Value::as_array).map(|ids| {
            ids.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        }),
    })
}

/// One manifest notice item, or `None` when its id or severity is not a string.
fn manifest_notice(value: &Value) -> Option<Notice> {
    let object = value.as_object()?;
    Some(Notice {
        id: object.get("id")?.as_str()?.to_owned(),
        severity: object.get("severity")?.as_str()?.to_owned(),
    })
}
