//! Mapping snapshots and manual records to the `disclosures` and `manual_edits`
//! rows.
//!
//! Pure leaves: they take a snapshot, or the manual records, and give back row
//! structs, with no disk or SQLite access (ADR 023).

use crate::read::{ChangeSnapshot, ManualEdit};

/// One row of the `disclosures` table.
pub(super) struct DisclosureRow {
    /// The change folder.
    pub(super) change: String,
    /// The result file's task id, as its name writes it.
    pub(super) task: String,
    /// The section's name.
    pub(super) section: String,
    /// The section's text.
    pub(super) text: String,
}

/// One row of the `manual_edits` table.
pub(super) struct ManualEditRow {
    /// The keep time, as the frontmatter writes it.
    pub(super) kept_at: String,
    /// The record's file name.
    pub(super) record: String,
    /// The body, trimmed.
    pub(super) comment: String,
    /// The paths joined with `, `.
    pub(super) paths: String,
    /// The capabilities joined with `, `.
    pub(super) capabilities: String,
}

/// Maps one snapshot's disclosures to `disclosures` rows, in task and section
/// order.
pub(super) fn disclosure_rows(snapshot: &ChangeSnapshot) -> Vec<DisclosureRow> {
    let mut rows = Vec::new();
    for disclosure in &snapshot.disclosures {
        push_section(
            &mut rows,
            &snapshot.folder,
            &disclosure.task,
            "deviated",
            disclosure.deviated.as_deref(),
        );
        push_section(
            &mut rows,
            &snapshot.folder,
            &disclosure.task,
            "missing_context",
            disclosure.missing_context.as_deref(),
        );
        push_section(
            &mut rows,
            &snapshot.folder,
            &disclosure.task,
            "outside_scope",
            disclosure.outside_scope.as_deref(),
        );
    }
    rows
}

/// Appends one row for a present section.
fn push_section(
    rows: &mut Vec<DisclosureRow>,
    change: &str,
    task: &str,
    section: &str,
    text: Option<&str>,
) {
    let Some(text) = text else {
        return;
    };
    rows.push(DisclosureRow {
        change: change.to_owned(),
        task: task.to_owned(),
        section: section.to_owned(),
        text: text.to_owned(),
    });
}

/// Maps the manual edit records to `manual_edits` rows, in record order.
pub(super) fn manual_edit_rows(records: &[ManualEdit]) -> Vec<ManualEditRow> {
    records
        .iter()
        .map(|record| ManualEditRow {
            kept_at: record.kept_at.clone(),
            record: record.file.clone(),
            comment: record.comment.clone(),
            paths: record.paths.join(", "),
            capabilities: record.capabilities.join(", "),
        })
        .collect()
}
