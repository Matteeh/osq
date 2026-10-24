//! The queue command: reading `openspec/queue.md` and printing its items.

mod links;
mod parse;
mod text;

use std::collections::BTreeMap;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_storage::frontmatter_string;

pub(crate) use links::{Folder, Groups, change_id};
pub(crate) use parse::QueueItem;
pub(crate) use text::QueueRow;

/// One queue file's items, associations and rows.
#[derive(Clone, Debug)]
pub(crate) struct QueueState {
    /// The parsed items, in queue order.
    pub(crate) items: Vec<QueueItem>,
    /// Every associated folder, grouped by the item its brief names.
    pub(crate) groups: BTreeMap<String, Groups>,
    /// The rows the queue prints, in queue order.
    pub(crate) rows: Vec<QueueRow>,
}

/// Reads the queue file under `root` and returns the text of its items.
///
/// Implements: rust-plan/queue-items
/// Implements: rust-plan/queue-refusals
/// Implements: rust-plan/queue-text
/// Implements: rust-plan/queue-associations
/// Implements: rust-plan/queue-states
pub(crate) fn run_queue(root: &Path) -> Result<String, FeatureError> {
    let state = read_state(root, "queue")?;
    Ok(text::format(&state.rows))
}

/// Reads the queue file and every folder naming one of its items.
///
/// Implements: rust-plan/queue-items
/// Implements: rust-plan/queue-refusals
/// Implements: rust-plan/queue-associations
/// Implements: rust-plan/queue-states
pub(crate) fn read_state(root: &Path, command: &str) -> Result<QueueState, FeatureError> {
    let path = root.join("openspec").join("queue.md");
    let Ok(content) = std::fs::read_to_string(&path) else {
        return Err(FeatureError::failed(
            command,
            format!("Queue file not found: {}", path.display()),
        ));
    };
    let items = parse::parse_queue(&content)
        .map_err(|detail| FeatureError::failed(command, format!("{}: {detail}", path.display())))?;
    let mut groups = scan_folders(root);
    let mut choices = BTreeMap::new();
    for item in &items {
        if let Some(group) = groups.get(&item.slug)
            && let Some(message) = links::ambiguity(&item.slug, group)
        {
            return Err(FeatureError::failed(command, message));
        }
        if let Some(folder) = groups
            .get_mut(&item.slug)
            .and_then(|group| group.active.first_mut())
        {
            fill_status(folder);
        }
        choices.insert(
            item.slug.clone(),
            links::select(item, groups.get(&item.slug)),
        );
    }
    let rows = text::rows(&items, &choices);
    Ok(QueueState {
        items,
        groups,
        rows,
    })
}

/// Reads every change folder whose brief names a queue item.
///
/// Implements: rust-plan/queue-associations
pub(crate) fn scan_folders(root: &Path) -> BTreeMap<String, Groups> {
    links::group(read_folders(root))
}

/// Reads each change folder whose brief names a queue item.
///
/// Implements: rust-plan/queue-associations
fn read_folders(root: &Path) -> Vec<Folder> {
    let mut folders = Vec::new();
    for entry in osq_kernel_storage::list_changes(root) {
        let Ok(text) = std::fs::read_to_string(entry.path.join("brief.md")) else {
            continue;
        };
        let Some(item) =
            frontmatter_string(&text, "queue_item").map(|value| value.trim().to_owned())
        else {
            continue;
        };
        if item.is_empty() {
            continue;
        }
        folders.push(Folder {
            item,
            entry,
            queue_hash: frontmatter_string(&text, "queue_hash"),
            status: None,
        });
    }
    folders
}

/// Reads one active folder's status when it holds a proposal or a spec.
///
/// Implements: rust-plan/queue-states
fn fill_status(folder: &mut Folder) {
    if !folder.entry.path.join("proposal.md").is_file()
        && !folder.entry.path.join("spec.md").is_file()
    {
        return;
    }
    if let Ok(snapshot) = osq_kernel_storage::read_change(&folder.entry) {
        folder.status = Some(snapshot.status);
    }
}
