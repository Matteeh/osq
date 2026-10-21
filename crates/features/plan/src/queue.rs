//! The queue command: reading `openspec/queue.md` and printing its items.

mod links;
mod parse;
mod text;

use std::collections::{BTreeMap, HashSet};
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_storage::frontmatter_string;

use links::Folder;

/// Reads the queue file under `root` and returns the text of its items.
///
/// Implements: rust-plan/queue-items
/// Implements: rust-plan/queue-refusals
/// Implements: rust-plan/queue-text
/// Implements: rust-plan/queue-associations
/// Implements: rust-plan/queue-states
pub(crate) fn run_queue(root: &Path) -> Result<String, FeatureError> {
    let path = root.join("openspec").join("queue.md");
    let Ok(content) = std::fs::read_to_string(&path) else {
        return Err(FeatureError::failed(
            "queue",
            format!("Queue file not found: {}", path.display()),
        ));
    };
    let items = parse::parse_queue(&content)
        .map_err(|detail| FeatureError::failed("queue", format!("{}: {detail}", path.display())))?;
    let mut groups = links::group(read_folders(root, &items));
    let mut choices = BTreeMap::new();
    for item in &items {
        if let Some(group) = groups.get(&item.slug) {
            if let Some(message) = links::ambiguity(&item.slug, group) {
                return Err(FeatureError::failed("queue", message));
            }
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
    Ok(text::format(&rows))
}

/// Reads every change folder whose brief names an item of this queue.
///
/// Implements: rust-plan/queue-associations
fn read_folders(root: &Path, items: &[parse::QueueItem]) -> Vec<Folder> {
    let slugs: HashSet<&str> = items.iter().map(|item| item.slug.as_str()).collect();
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
        if !slugs.contains(item.as_str()) {
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
