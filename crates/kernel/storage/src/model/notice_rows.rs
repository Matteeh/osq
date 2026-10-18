//! Mapping plan records and manifest notices to the `notices` rows.

use crate::read::{ChangeSnapshot, Location, ManifestNotices, PlanRecord};

/// One row of the `notices` table.
pub(super) struct NoticeRow {
    /// The change folder.
    pub(super) change: String,
    /// The notice id.
    pub(super) notice: String,
    /// The notice severity.
    pub(super) severity: String,
    /// 1, 0 or null, following the manifest's opened ids.
    pub(super) opened: Option<i64>,
    /// The notice's outcome.
    pub(super) outcome: String,
}

/// The archived and rejected snapshots, ordered by folder name.
pub(super) fn notice_subjects(snapshots: &[ChangeSnapshot]) -> Vec<&ChangeSnapshot> {
    let mut subjects: Vec<&ChangeSnapshot> = snapshots
        .iter()
        .filter(|snapshot| snapshot.location != Location::Active)
        .collect();
    subjects.sort_by(|left, right| left.folder.cmp(&right.folder));
    subjects
}

/// The notice rows of one archived or rejected snapshot, in insertion order.
pub(super) fn notice_rows(snapshot: &ChangeSnapshot) -> Vec<NoticeRow> {
    let mut rows = Vec::new();
    for record in leading_records(&snapshot.plan_records) {
        push_record(&mut rows, &snapshot.folder, record, "planned_again");
    }
    if let Some(manifest) = &snapshot.manifest_notices {
        let outcome = manifest_outcome(snapshot);
        for item in &manifest.items {
            rows.push(NoticeRow {
                change: snapshot.folder.clone(),
                notice: item.id.clone(),
                severity: item.severity.clone(),
                opened: opened_for(manifest, &item.id),
                outcome: outcome.to_owned(),
            });
        }
        return rows;
    }
    if snapshot.location == Location::Rejected {
        if let Some(last) = snapshot.plan_records.last() {
            push_record(&mut rows, &snapshot.folder, last, "rejected");
        }
    }
    rows
}

/// Every plan record but the last.
fn leading_records(records: &[PlanRecord]) -> &[PlanRecord] {
    records.split_last().map_or(records, |(_, rest)| rest)
}

/// Appends one row per notice of a plan record.
fn push_record(rows: &mut Vec<NoticeRow>, folder: &str, record: &PlanRecord, outcome: &str) {
    for notice in &record.notices {
        rows.push(NoticeRow {
            change: folder.to_owned(),
            notice: notice.id.clone(),
            severity: notice.severity.clone(),
            opened: None,
            outcome: outcome.to_owned(),
        });
    }
}

/// The outcome of a manifest's notice items: rejected, halted or approved.
fn manifest_outcome(snapshot: &ChangeSnapshot) -> &'static str {
    if snapshot.location == Location::Rejected {
        "rejected"
    } else if halts(snapshot) > 0 {
        "halted"
    } else {
        "approved"
    }
}

/// The manual retries of a change, zero without facts.
fn halts(snapshot: &ChangeSnapshot) -> u64 {
    snapshot.facts.as_ref().map_or(0, |facts| facts.halts)
}

/// 1 when the manifest opened the id, 0 when not, null without opened ids.
fn opened_for(manifest: &ManifestNotices, id: &str) -> Option<i64> {
    manifest
        .opened
        .as_ref()
        .map(|opened| i64::from(opened.iter().any(|entry| entry == id)))
}
