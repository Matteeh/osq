//! Proves the archive leaves the approval seal of the folder it archives.

mod reseal;
mod support;

use std::fs;
use std::path::Path;

use osq_kernel_storage::change_folder_seal;

use support::{run, scratch, tree};

/// The fixture change the tests archive.
const CHANGE: &str = "openspec/changes/007-sample";

/// The archived fixture change.
const ARCHIVED: &str = "openspec/changes/archive/007-sample";

/// The seal of the fixture change as its `.run/approved` records it.
const SEAL: &str = "sha256:9e4011d19d8c95e04f274c6f9cbdbbea2ae81869c997edd3b30687be72ce2a37";

/// Proves the archived folder's seal and marker both equal the approved seal.
///
/// Covers: rust-archive/archived-seal-matches-approval
#[test]
fn archived_seal_matches_approval() {
    let root = scratch("seal-matches-approval");
    run(&root, &["007"]).expect("the change archives");
    let archived = root.join(ARCHIVED);
    assert_eq!(change_folder_seal(&archived).unwrap().as_str(), SEAL);
    assert_eq!(read(&archived.join(".run/approved")), SEAL);
}

/// Proves a change with no root `tasks.md` archives and leaves its nested one alone.
///
/// Covers: rust-archive/missing-root-tasks-file
#[test]
fn missing_root_tasks_file() {
    let root = scratch("seal-missing-root-tasks");
    let change = root.join(CHANGE);
    fs::remove_file(change.join("tasks.md")).unwrap();
    reseal::reseal(&change);
    run(&root, &["007"]).expect("a missing root tasks file is fine");
    let archived = root.join(ARCHIVED);
    assert!(!archived.join("tasks.md").exists());
    assert!(!tree(&archived).contains_key("tasks.md"));
    assert_eq!(
        read(&archived.join("notes/tasks.md")),
        "- [ ] a nested tasks file keeps its bytes\n"
    );
}

/// Reads a file as UTF-8 text.
fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap()
}
