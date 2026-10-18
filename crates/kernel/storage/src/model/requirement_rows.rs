//! Mapping snapshots to the `requirements` rows.
//!
//! A pure leaf: it takes a snapshot and gives back row structs, with no disk or
//! SQLite access (ADR 023).

use crate::read::{CapabilityDelta, ChangeSnapshot};

/// One row of the `requirements` table.
pub(super) struct RequirementRow {
    /// The change folder.
    pub(super) change: String,
    /// The delta capability folder.
    pub(super) capability: String,
    /// `added`, `modified`, `removed` or `renamed`.
    pub(super) kind: &'static str,
    /// The requirement name, the new one for a rename.
    pub(super) requirement: String,
    /// The old name of a rename, null otherwise.
    pub(super) renamed_from: Option<String>,
}

/// Maps one snapshot's deltas to `requirements` rows, in delta and kind order.
pub(super) fn requirement_rows(snapshot: &ChangeSnapshot) -> Vec<RequirementRow> {
    let mut rows = Vec::new();
    for delta in &snapshot.deltas {
        push_requirements(&mut rows, snapshot, delta);
    }
    rows
}

/// Appends one capability delta's rows: added, then modified, then removed,
/// then each rename keyed on its new name.
fn push_requirements(
    rows: &mut Vec<RequirementRow>,
    snapshot: &ChangeSnapshot,
    delta: &CapabilityDelta,
) {
    for requirement in &delta.delta.added {
        push_requirement(rows, snapshot, delta, "added", &requirement.name, None);
    }
    for requirement in &delta.delta.modified {
        push_requirement(rows, snapshot, delta, "modified", &requirement.name, None);
    }
    for name in &delta.delta.removed {
        push_requirement(rows, snapshot, delta, "removed", name, None);
    }
    for rename in &delta.delta.renamed {
        push_requirement(
            rows,
            snapshot,
            delta,
            "renamed",
            &rename.to,
            Some(rename.from.clone()),
        );
    }
}

/// Appends one requirement row.
fn push_requirement(
    rows: &mut Vec<RequirementRow>,
    snapshot: &ChangeSnapshot,
    delta: &CapabilityDelta,
    kind: &'static str,
    requirement: &str,
    renamed_from: Option<String>,
) {
    rows.push(RequirementRow {
        change: snapshot.folder.clone(),
        capability: delta.capability.clone(),
        kind,
        requirement: requirement.to_owned(),
        renamed_from,
    });
}
