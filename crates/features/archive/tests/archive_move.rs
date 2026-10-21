//! Proves the archive move's names, its output and the ticked checkboxes.

mod reseal;
mod support;

use std::fs;
use std::path::Path;

use support::{fixture, run, scratch, tree};

/// The fixture change the tests archive.
const CHANGE: &str = "openspec/changes/007-sample";

/// The archive folder under the project's changes.
const ARCHIVE: &str = "openspec/changes/archive";

/// The archived fixture change.
const ARCHIVED: &str = "openspec/changes/archive/007-sample";

/// Proves the moved folder's path, its removed prompt and its absent event.
///
/// Covers: rust-archive/archived-folder
#[test]
fn archived_folder() {
    let root = scratch("move-archived-folder");
    let output = run(&root, &["007"]).expect("the change archives");
    assert_eq!(output.text, ARCHIVED);
    assert!(!tree(&root).contains_key(CHANGE));
    let archived = root.join(ARCHIVED);
    assert!(!archived.join("plan-prompt.md").exists());
    assert!(!archived.join(".run/events/change.jsonl").exists());
}

/// Proves a change with no planning prompt still archives.
///
/// Covers: rust-archive/archived-folder
#[test]
fn missing_plan_prompt_is_not_an_error() {
    let root = scratch("move-missing-prompt");
    fs::remove_file(root.join(CHANGE).join("plan-prompt.md")).unwrap();
    let output = run(&root, &["007"]).expect("a missing prompt is fine");
    assert_eq!(output.text, ARCHIVED);
    assert!(!root.join(ARCHIVED).join("plan-prompt.md").exists());
}

/// Proves each row of the taken-name table picks the row's suffix.
///
/// Covers: rust-archive/archive-name-taken
#[test]
fn archive_name_taken() {
    let rows: [(&[&str], &str); 3] = [
        (&[], "openspec/changes/archive/007-sample"),
        (&["007-sample"], "openspec/changes/archive/007-sample-1"),
        (
            &["007-sample", "007-sample-1"],
            "openspec/changes/archive/007-sample-2",
        ),
    ];
    for (index, (existing, expected)) in rows.iter().enumerate() {
        let root = scratch(&format!("move-name-{index}"));
        for name in *existing {
            fs::create_dir_all(root.join(ARCHIVE).join(name)).unwrap();
        }
        let output = run(&root, &["007"]).expect("the change archives");
        assert_eq!(output.text, *expected, "row {index}");
        assert!(
            root.join(expected).join("proposal.md").is_file(),
            "row {index} moved the change"
        );
    }
}

/// Proves each row of the ticked-lines table and both nested files.
///
/// Covers: rust-archive/ticked-task-lines
#[test]
fn ticked_task_lines() {
    let root = scratch("move-ticked-lines");
    run(&root, &["007"]).expect("the change archives");
    let archived = root.join(ARCHIVED);
    let tasks = read(&archived.join("tasks.md"));
    let rows: [(&str, &str); 8] = [
        (
            "- [ ] 1. When alpha changes, alpha does it twice",
            "- [x] 1. When alpha changes, alpha does it twice",
        ),
        ("  - [ ] an indented item", "  - [x] an indented item"),
        ("* [ ] a star item", "* [x] a star item"),
        ("-\t[ ] a tab after the dash", "-\t[x] a tab after the dash"),
        (
            "- [x] an item already ticked",
            "- [x] an item already ticked",
        ),
        ("- [ ]no space after the box", "- [x]no space after the box"),
        ("not a list [ ] item", "not a list [ ] item"),
        (
            "-[ ] no space after the dash",
            "-[ ] no space after the dash",
        ),
    ];
    for (index, (_, after)) in rows.iter().enumerate() {
        assert!(
            tasks.lines().any(|line| line == *after),
            "row {index} is {after:?}"
        );
    }
    assert_eq!(
        read(&archived.join("notes/tasks.md")),
        "- [x] a nested tasks file is ticked too\n"
    );
    let todo = read(&archived.join("notes/todo.md"));
    assert_eq!(todo, "- [ ] a file not named tasks.md keeps its box\n");
    assert_eq!(todo, read(&fixture().join(CHANGE).join("notes/todo.md")));
}

/// Proves each row of the line-starts table, with no newline at the end.
///
/// Covers: rust-archive/line-starts
#[test]
fn line_starts() {
    let rows: [(&str, &str); 5] = [
        ("- [ ] a\r\n- [ ] b", "- [x] a\r\n- [x] b"),
        ("- [ ] a\r- [ ] b", "- [x] a\r- [x] b"),
        ("- [ ] a\u{2028}- [ ] b", "- [x] a\u{2028}- [x] b"),
        ("- [ ] a\u{2029}- [ ] b", "- [x] a\u{2029}- [x] b"),
        ("x - [ ] a", "x - [ ] a"),
    ];
    for (index, (before, after)) in rows.iter().enumerate() {
        let root = scratch(&format!("move-line-starts-{index}"));
        let change = root.join(CHANGE);
        fs::write(change.join("tasks.md"), before).unwrap();
        reseal::reseal(&change);
        run(&root, &["007"]).expect("the change archives");
        let archived = read(&root.join(ARCHIVED).join("tasks.md"));
        assert_eq!(archived, *after, "row {index}");
    }
}

/// Proves a skipped entry keeps the boxes of the `tasks.md` inside it.
///
/// Covers: rust-archive/ticked-task-lines
#[test]
fn skipped_entries_are_not_ticked() {
    let root = scratch("move-skipped");
    let change = root.join(CHANGE);
    for skipped in [".run", ".git", ".DS_Store"] {
        fs::create_dir_all(change.join(skipped)).unwrap();
        fs::write(change.join(skipped).join("tasks.md"), "- [ ] kept\n").unwrap();
    }
    run(&root, &["007"]).expect("the change archives");
    for skipped in [".run", ".git", ".DS_Store"] {
        let path = root.join(ARCHIVED).join(skipped).join("tasks.md");
        assert_eq!(read(&path), "- [ ] kept\n", "{skipped} is skipped");
    }
}

/// Proves runs of tabs and several spaces around the dash are still one run.
///
/// Covers: rust-archive/ticked-task-lines
#[test]
fn runs_of_spaces_and_tabs() {
    let root = scratch("move-space-runs");
    let change = root.join(CHANGE);
    let before = "-   [ ] many spaces\n\t- [ ] leading tab\n- \t [ ] mixed run\n";
    let after = "-   [x] many spaces\n\t- [x] leading tab\n- \t [x] mixed run\n";
    fs::write(change.join("tasks.md"), before).unwrap();
    reseal::reseal(&change);
    run(&root, &["007"]).expect("the change archives");
    assert_eq!(read(&root.join(ARCHIVED).join("tasks.md")), after);
}

/// Proves an already ticked `tasks.md` is left unwritten.
///
/// Covers: rust-archive/ticked-task-lines
#[cfg(unix)]
#[test]
fn unchanged_tasks_file_is_not_written() {
    use std::os::unix::fs::PermissionsExt;

    let root = scratch("move-unchanged");
    let change = root.join(CHANGE);
    let path = change.join("tasks.md");
    fs::write(&path, "- [x] already ticked\n").unwrap();
    reseal::reseal(&change);
    let mut permissions = fs::metadata(&path).unwrap().permissions();
    permissions.set_mode(0o444);
    fs::set_permissions(&path, permissions).unwrap();

    run(&root, &["007"]).expect("an unchanged file is not written");
    assert_eq!(
        read(&root.join(ARCHIVED).join("tasks.md")),
        "- [x] already ticked\n"
    );
}

/// Reads a file as UTF-8 text.
fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap()
}
