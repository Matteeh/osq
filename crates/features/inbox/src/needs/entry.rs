//! Building the items one active change contributes before steering.

use osq_core::TaskStatus;
use osq_kernel_storage::ChangeSnapshot;

use super::placeholder::is_placeholder;
use super::{Entry, Kind, TaskRef};

/// The items one change contributes, in the order the requirement lists them.
pub(crate) fn change_entries(snapshot: &ChangeSnapshot, id: &str) -> Vec<Entry> {
    let title = snapshot.title.clone().unwrap_or_default();
    let mut entries = Vec::new();
    if !snapshot.approved {
        entries.push(unapproved(snapshot, id, &title));
    }
    if snapshot.state.record().regressed {
        entries.push(Entry::new(
            id,
            &title,
            None,
            Kind::ChangeRegressed,
            format!("osq retry {id} change"),
        ));
    }
    for task in &snapshot.tasks {
        let status = snapshot
            .state
            .tasks()
            .get(&task.id)
            .map_or(TaskStatus::Pending, |state| state.status);
        if status != TaskStatus::Dead && status != TaskStatus::Regressed {
            continue;
        }
        let task_title = if task.title.is_empty() {
            format!("{}.md", task.id)
        } else {
            task.title.clone()
        };
        let reference = TaskRef {
            number: task.id.as_str().to_owned(),
            title: task_title,
        };
        entries.push(Entry::new(
            id,
            &title,
            Some(reference),
            Kind::Task,
            format!("osq retry {id} {}", task.id),
        ));
    }
    entries
}

/// A planning or approval item for a change that is not approved.
fn unapproved(snapshot: &ChangeSnapshot, id: &str, title: &str) -> Entry {
    let verify = snapshot.verify.trim();
    if verify.is_empty() || is_placeholder(verify) {
        let command = if snapshot.brief {
            format!("osq plan {id}")
        } else {
            format!("osq lint {id}")
        };
        return Entry::new(id, title, None, Kind::Planning, command);
    }
    let kind = Kind::Approval {
        steps_first: snapshot.before_approval.is_some(),
    };
    Entry::new(id, title, None, kind, format!("osq approve {id}"))
}
