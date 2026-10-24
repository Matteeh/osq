//! Proves the fingerprint a halt marker's frontmatter records.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{ChangeSnapshot, Location, TaskFile, list_changes, read_change};

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

/// One task of a snapshot, by its id.
fn task<'a>(snapshot: &'a ChangeSnapshot, id: &str) -> &'a TaskFile {
    snapshot
        .tasks
        .iter()
        .find(|task| task.id.as_str() == id)
        .expect("the task exists")
}

/// The `052-stuck` change folder its scenario names, read into a snapshot.
fn stuck_snapshot() -> ChangeSnapshot {
    let root = temp_root("marker_fingerprint_stuck");
    let dir = root.join("openspec/changes/052-stuck");
    write(&dir.join("proposal.md"), "---\ntitle: \"052-stuck\"\n---\n");
    for number in 1..=3 {
        write(
            &dir.join(format!("tasks/{number}.md")),
            &format!("---\ntitle: \"Task {number}\"\n---\n"),
        );
    }
    write(
        &dir.join(".run/dead/1.md"),
        "---\nreason: timeout\nfingerprint: sha256:0008\nstuck: true\n---\n",
    );
    write(
        &dir.join(".run/dead/2.md"),
        "---\nreason: timeout\nfingerprint: 8\n---\n",
    );
    write(
        &dir.join(".run/regressed/3.md"),
        "---\nreason: verify_red\n---\n",
    );
    read_active(&root, "052-stuck")
}

/// Proves a string fingerprint reads and a number one does not.
///
/// Covers: rust-storage/marker-fingerprint
#[test]
fn marker_fingerprint() {
    let snapshot = stuck_snapshot();
    let dead = task(&snapshot, "1")
        .markers
        .dead
        .as_ref()
        .expect("task 1 has a dead marker");
    assert_eq!(dead.fingerprint.as_deref(), Some("sha256:0008"));
    assert!(dead.stuck);
    let numbered = task(&snapshot, "2")
        .markers
        .dead
        .as_ref()
        .expect("task 2 has a dead marker");
    assert_eq!(numbered.fingerprint, None);
    let regressed = task(&snapshot, "3")
        .markers
        .regressed
        .as_ref()
        .expect("task 3 has a regressed marker");
    assert_eq!(regressed.fingerprint, None);
}
