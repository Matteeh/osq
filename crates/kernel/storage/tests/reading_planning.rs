//! Proves the proposal, brief and before-approval facts of change folders.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{ChangeSnapshot, Location, list_changes, read_change};

/// A fresh temporary project root, with anything at that name removed.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// The one active change folder of a temporary project, read into its snapshot.
fn read_active(root: &Path, folder: &str) -> ChangeSnapshot {
    let entry = list_changes(root)
        .into_iter()
        .find(|entry| entry.folder == folder && entry.location == Location::Active)
        .expect("the change folder is listed");
    read_change(&entry).unwrap()
}

/// Proves whether a folder holds a proposal, a brief and steps before approval.
///
/// Covers: rust-storage/planning-facts-of-change-folders
#[test]
fn planning_facts_of_change_folders() {
    let root = temp_root("reading_planning");
    let changes = root.join("openspec/changes");
    write(
        &changes.join("060-steps/proposal.md"),
        "---\ntitle: \"060-steps\"\n---\n## Human steps\n\n### Before approval\n\n- Set the key.\n\n### After landing\n\nNone\n",
    );
    write(
        &changes.join("060-steps/brief.md"),
        "---\nplanner: human\n---\n",
    );
    write(
        &changes.join("061-none/proposal.md"),
        "---\ntitle: \"061-none\"\n---\n## human steps\n\n### before approval\n\nNone.\n",
    );
    write(
        &changes.join("062-after/proposal.md"),
        "---\ntitle: \"062-after\"\n---\n## Human steps\n\nTell the team.\n\n### After landing\n\n- Ship it.\n\n## Delta\n\n### Before approval\n\n- Not a step.\n",
    );
    write(
        &changes.join("063-bare/brief.md"),
        "---\nplanner: human\n---\n",
    );

    let snapshot = read_active(&root, "060-steps");
    assert_eq!(
        (
            snapshot.proposal,
            snapshot.brief,
            snapshot.before_approval.as_deref()
        ),
        (true, true, Some("- Set the key."))
    );
    let snapshot = read_active(&root, "061-none");
    assert_eq!(
        (
            snapshot.proposal,
            snapshot.brief,
            snapshot.before_approval.as_deref()
        ),
        (true, false, None)
    );
    let snapshot = read_active(&root, "062-after");
    assert_eq!(
        (
            snapshot.proposal,
            snapshot.brief,
            snapshot.before_approval.as_deref()
        ),
        (true, false, None)
    );
    let snapshot = read_active(&root, "063-bare");
    assert_eq!(
        (
            snapshot.proposal,
            snapshot.brief,
            snapshot.before_approval.as_deref()
        ),
        (false, true, None)
    );
}
