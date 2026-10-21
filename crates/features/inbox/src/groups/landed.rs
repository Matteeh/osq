//! The Landed since last look group's lines.

use osq_kernel_storage::{ChangeSnapshot, Location, timestamp_ms};

use super::{change_id, compare_ids};

/// The newest ten archived changes, as landed lines.
pub(crate) fn lines(snapshots: &[ChangeSnapshot]) -> Vec<String> {
    let mut items: Vec<(&ChangeSnapshot, i64)> = snapshots
        .iter()
        .filter(|snapshot| snapshot.location == Location::Archived)
        .filter_map(|snapshot| {
            let archived = snapshot.archive_time.as_deref()?;
            Some((snapshot, timestamp_ms(archived).unwrap_or(0)))
        })
        .collect();
    items.sort_by(|(left, left_time), (right, right_time)| {
        right_time
            .cmp(left_time)
            .then_with(|| compare_ids(&change_id(left), &change_id(right)))
    });
    items
        .into_iter()
        .take(10)
        .map(|(snapshot, _)| line(snapshot))
        .collect()
}

/// One archived change's landed line.
fn line(snapshot: &ChangeSnapshot) -> String {
    let id = change_id(snapshot);
    let title = snapshot
        .title
        .clone()
        .unwrap_or_else(|| snapshot.folder.clone());
    let archived = snapshot.archive_time.as_deref().unwrap_or_default();
    format!(
        "  {id}: {title} — archived {archived}{} — osq show {id}",
        disclosed(snapshot)
    )
}

/// The `— disclosed: ...` suffix, empty when no task disclosed a gap.
fn disclosed(snapshot: &ChangeSnapshot) -> String {
    let deviated = count(snapshot, |disclosure| disclosure.deviated.is_some());
    let missing = count(snapshot, |disclosure| disclosure.missing_context.is_some());
    let outside = count(snapshot, |disclosure| disclosure.outside_scope.is_some());
    let mut parts = Vec::new();
    if deviated > 0 {
        parts.push(format!("deviated {deviated}"));
    }
    if missing > 0 {
        parts.push(format!("missing context {missing}"));
    }
    if outside > 0 {
        parts.push(format!("outside scope {outside}"));
    }
    if parts.is_empty() {
        String::new()
    } else {
        format!(" — disclosed: {}", parts.join(", "))
    }
}

/// How many task disclosures hold one section.
fn count(
    snapshot: &ChangeSnapshot,
    holds: impl Fn(&osq_kernel_storage::TaskDisclosure) -> bool,
) -> usize {
    snapshot
        .disclosures
        .iter()
        .filter(|entry| holds(entry))
        .count()
}
