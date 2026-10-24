//! Choosing the next queue item and ordering the active failures.

use std::cmp::Ordering;
use std::collections::BTreeMap;

use osq_kernel_storage::ChangeSnapshot;

use crate::queue::{Groups, QueueItem, QueueRow, QueueState, change_id};

/// One active failure, ready to print.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Failure {
    /// The change folder's leading digits, or its whole name.
    change_id: String,
    /// The failed target: a task number or `change`.
    target: String,
    /// Why it failed.
    reason: String,
}

/// Chooses the first eligible item, refusing when none is or a rejection needs `--replan`.
///
/// Implements: rust-plan/next-queue-item
pub(super) fn choose(state: &QueueState, replan: bool) -> Result<(&QueueItem, &QueueRow), String> {
    let Some(index) = state
        .rows
        .iter()
        .position(|row| matches!(row.state, "unplanned" | "rejected") && row.unmet.is_empty())
    else {
        return Err(format!(
            "No queue item is eligible to plan.\n{}",
            summary(&state.rows)
        ));
    };
    let row = &state.rows[index];
    let item = &state.items[index];
    if row.state == "rejected" && !replan {
        return Err(format!(
            "Queue item \"{}\" has {} rejected attempt(s) and no active plan. Re-run with --replan to create a new attempt.",
            row.slug, row.rejections
        ));
    }
    Ok((item, row))
}

/// Formats one line per queue row for the no-eligible-item refusal.
///
/// Implements: rust-plan/next-queue-item
fn summary(rows: &[QueueRow]) -> String {
    rows.iter()
        .map(|row| {
            let waiting = if row.unmet.is_empty() {
                String::new()
            } else {
                format!(" (waiting on {})", row.unmet.join(", "))
            };
            format!("  - {}: {}{waiting}", row.slug, row.state)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Reads every active failure from the given readable change snapshots.
///
/// Implements: rust-plan/next-queue-item
pub(super) fn failures(changes: &[(String, ChangeSnapshot)]) -> Vec<Failure> {
    let mut failures = Vec::new();
    for (folder, snapshot) in changes {
        let id = change_id(folder);
        if snapshot.change_regressed.is_some() {
            failures.push(Failure {
                change_id: id.clone(),
                target: "change".to_owned(),
                reason: "regressed".to_owned(),
            });
        }
        for task in &snapshot.tasks {
            let target = task.id.to_string();
            if task.markers.regressed.is_some() {
                failures.push(Failure {
                    change_id: id.clone(),
                    target,
                    reason: "regressed".to_owned(),
                });
            } else if !task.done
                && let Some(dead) = &task.markers.dead
            {
                let reason = if dead.reason.is_empty() {
                    "dead"
                } else {
                    dead.reason.as_str()
                };
                failures.push(Failure {
                    change_id: id.clone(),
                    target,
                    reason: reason.to_owned(),
                });
            }
        }
    }
    failures.sort_by(compare);
    failures
}

/// Formats the active-failure refusal.
///
/// Implements: rust-plan/next-queue-item
pub(super) fn failure_message(failures: &[Failure]) -> String {
    let lines = failures
        .iter()
        .map(|failure| {
            format!(
                "  - {} {} ({}): osq retry {} {}",
                failure.change_id,
                failure.target,
                failure.reason,
                failure.change_id,
                failure.target
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("Queue planning is blocked by active failures:\n{lines}")
}

/// Orders failures by change id, then by target.
///
/// Implements: rust-plan/next-queue-item
fn compare(left: &Failure, right: &Failure) -> Ordering {
    compare_numeric(&left.change_id, &right.change_id)
        .then_with(|| compare_numeric(&left.target, &right.target))
}

/// Compares all-digit text by value and puts it before other text.
///
/// Implements: rust-plan/next-queue-item
fn compare_numeric(left: &str, right: &str) -> Ordering {
    match (number(left), number(right)) {
        (Some(left), Some(right)) => left.cmp(&right),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => left.cmp(right),
    }
}

/// Reads text that is all digits into its value.
///
/// Implements: rust-plan/next-queue-item
fn number(text: &str) -> Option<u128> {
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

/// Reads the archived change ids of the given slugs, in their order.
///
/// Implements: rust-plan/next-queue-item
/// Implements: rust-plan/change-folder-files
pub(super) fn landed_ids(slugs: &[String], groups: &BTreeMap<String, Groups>) -> Vec<String> {
    let mut ids = Vec::new();
    for slug in slugs {
        let Some(group) = groups.get(slug) else {
            continue;
        };
        if group.archived.len() == 1 {
            ids.push(change_id(&group.archived[0].entry.folder));
        }
    }
    ids
}
