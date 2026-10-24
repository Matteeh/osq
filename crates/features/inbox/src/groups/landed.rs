//! The Landed since last look group's items.

use osq_kernel_storage::{ChangeSnapshot, Location, timestamp_ms};

use super::{change_id, compare_ids};

/// The disclosure counts of one landed change.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Counts {
    /// The tasks holding a `## Deviated` section.
    pub(crate) deviated: usize,
    /// The tasks holding a `## Missing context` section.
    pub(crate) missing_context: usize,
    /// The tasks holding a `## Outside scope` section.
    pub(crate) outside_scope: usize,
}

/// One Landed group item: the facts both its line and its JSON object print.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Item {
    /// The change id.
    pub(crate) id: String,
    /// The change title, or its folder name.
    pub(crate) title: String,
    /// The archive time as its event writes it.
    pub(crate) archived_at: String,
    /// The disclosures, or `None` when no task disclosed a gap.
    pub(crate) disclosures: Option<Counts>,
}

impl Item {
    /// The item's one rendered line.
    pub(crate) fn line(&self) -> String {
        format!(
            "  {}: {} — archived {}{} — osq show {}",
            self.id,
            self.title,
            self.archived_at,
            disclosed(self.disclosures),
            self.id
        )
    }
}

/// The archived changes after the cursor, or the newest ten, as landed items.
///
/// Implements: rust-inbox/landed-items
pub(crate) fn items(snapshots: &[ChangeSnapshot], last_look: Option<i64>) -> Vec<Item> {
    let mut found: Vec<(&ChangeSnapshot, i64)> = snapshots
        .iter()
        .filter(|snapshot| snapshot.location == Location::Archived)
        .filter_map(|snapshot| {
            let archived = snapshot.archive_time.as_deref()?;
            let time = timestamp_ms(archived).unwrap_or(0);
            if last_look.is_some_and(|cursor| time <= cursor) {
                return None;
            }
            Some((snapshot, time))
        })
        .collect();
    found.sort_by(|(left, left_time), (right, right_time)| {
        right_time
            .cmp(left_time)
            .then_with(|| compare_ids(&change_id(left), &change_id(right)))
    });
    let limit = if last_look.is_some() { found.len() } else { 10 };
    found
        .into_iter()
        .take(limit)
        .map(|(snapshot, _)| item(snapshot))
        .collect()
}

/// One archived change's landed item.
fn item(snapshot: &ChangeSnapshot) -> Item {
    let counts = counts(snapshot);
    let any = (
        counts.deviated,
        counts.missing_context,
        counts.outside_scope,
    ) != (0, 0, 0);
    Item {
        id: change_id(snapshot),
        title: snapshot
            .title
            .clone()
            .unwrap_or_else(|| snapshot.folder.clone()),
        archived_at: snapshot.archive_time.clone().unwrap_or_default(),
        disclosures: any.then_some(counts),
    }
}

/// The `— disclosed: ...` suffix, empty when no task disclosed a gap.
fn disclosed(counts: Option<Counts>) -> String {
    let Some(counts) = counts else {
        return String::new();
    };
    let mut parts = Vec::new();
    if counts.deviated > 0 {
        parts.push(format!("deviated {}", counts.deviated));
    }
    if counts.missing_context > 0 {
        parts.push(format!("missing context {}", counts.missing_context));
    }
    if counts.outside_scope > 0 {
        parts.push(format!("outside scope {}", counts.outside_scope));
    }
    format!(" — disclosed: {}", parts.join(", "))
}

/// How many task disclosures hold each section.
fn counts(snapshot: &ChangeSnapshot) -> Counts {
    Counts {
        deviated: count(snapshot, |disclosure| disclosure.deviated.is_some()),
        missing_context: count(snapshot, |disclosure| disclosure.missing_context.is_some()),
        outside_scope: count(snapshot, |disclosure| disclosure.outside_scope.is_some()),
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
