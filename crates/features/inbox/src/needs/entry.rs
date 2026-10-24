//! Building the items one active change contributes before steering.

use osq_core::TaskStatus;
use osq_kernel_storage::ChangeSnapshot;

use super::placeholder::is_placeholder;
use super::{Item, Kind, TaskRef};

/// The items one change contributes, in the order the requirement lists them.
pub(crate) fn change_entries(snapshot: &ChangeSnapshot, id: &str) -> Vec<Item> {
    let title = snapshot.title.clone().unwrap_or_default();
    let mut entries = Vec::new();
    if !snapshot.approved {
        entries.push(unapproved(snapshot, id, &title));
    }
    if snapshot.state.record().regressed {
        entries.push(Item::new(
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
        let kind = if status == TaskStatus::Dead {
            Kind::TaskDead
        } else {
            Kind::TaskRegressed
        };
        let mut item = Item::new(
            id,
            &title,
            Some(reference),
            kind,
            format!("osq retry {id} {}", task.id),
        );
        if status == TaskStatus::Dead {
            item.stuck = task
                .markers
                .dead
                .as_ref()
                .filter(|marker| marker.stuck)
                .and_then(|marker| marker.fingerprint.clone());
        }
        entries.push(item);
    }
    entries
}

/// A planning or approval item for a change that is not approved.
fn unapproved(snapshot: &ChangeSnapshot, id: &str, title: &str) -> Item {
    let verify = snapshot.verify.trim();
    if verify.is_empty() || is_placeholder(verify) {
        let command = if snapshot.brief {
            format!("osq plan {id}")
        } else {
            format!("osq lint {id}")
        };
        return Item::new(id, title, None, Kind::Planning, command);
    }
    let kind = Kind::Approval {
        steps_first: snapshot.before_approval.is_some(),
    };
    Item::new(id, title, None, kind, format!("osq approve {id}"))
}
