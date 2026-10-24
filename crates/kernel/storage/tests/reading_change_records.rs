//! Proves the change fixes and result disclosure readers.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{TaskDisclosure, read_change_fixes, read_result_disclosures};

/// One row of the "Fixes of change folders" table.
struct Row {
    /// The scratch folder's name and the assertion's label.
    name: &'static str,
    /// The files to write: their names and contents.
    files: Vec<(&'static str, &'static str)>,
    /// The change ids the row expects.
    expected: Vec<&'static str>,
}

/// A fresh change folder under `CARGO_TARGET_TMPDIR`.
fn scratch(test: &str, name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_change_records")
        .join(test)
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the scratch change folder is created");
    folder
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent")).expect("the parent is made");
    fs::write(path, text).expect("the file is written");
}

/// Every row of the "Fixes of change folders" table, in its order.
fn rows() -> Vec<Row> {
    vec![
        Row {
            name: "duplicate-numeric-ids",
            files: vec![("proposal.md", "---\nfixes: [201, \"201\"]\n---\n")],
            expected: vec!["201", "201"],
        },
        Row {
            name: "padded-and-text-ids",
            files: vec![("proposal.md", "---\nfixes: [1, abc]\n---\n")],
            expected: vec!["001", "abc"],
        },
        Row {
            name: "without-fixes",
            files: vec![("proposal.md", "---\ntitle: One\n---\n")],
            expected: Vec::new(),
        },
        Row {
            name: "spec-file",
            files: vec![("spec.md", "---\nfixes: [7]\n---\n")],
            expected: vec!["007"],
        },
        Row {
            name: "proposal-wins-without-fixes",
            files: vec![
                ("proposal.md", "---\ntitle: One\n---\n"),
                ("spec.md", "---\nfixes: [7]\n---\n"),
            ],
            expected: Vec::new(),
        },
        Row {
            name: "bad-frontmatter",
            files: vec![("proposal.md", "---\nfixes: [\n---\n")],
            expected: Vec::new(),
        },
        Row {
            name: "no-file",
            files: Vec::new(),
            expected: Vec::new(),
        },
    ]
}

/// Proves every row of the "Fixes of change folders" table.
///
/// Covers: rust-storage/fixes-of-change-folders
#[test]
fn fixes_of_change_folders() {
    for row in rows() {
        let folder = scratch("fixes_of_change_folders", row.name);
        for (name, text) in row.files {
            write(&folder.join(name), text);
        }
        let expected: Vec<String> = row.expected.iter().map(ToString::to_string).collect();
        assert_eq!(read_change_fixes(&folder), expected, "{}", row.name);
    }
}

/// Proves a proposal that is a folder has no readable fixes.
///
/// Covers: rust-storage/fixes-of-change-folders
#[test]
fn unreadable_proposal_gives_no_fixes() {
    let folder = scratch("unreadable_proposal_gives_no_fixes", "row");
    fs::create_dir_all(folder.join("proposal.md")).expect("the proposal folder is made");
    assert_eq!(read_change_fixes(&folder), Vec::<String>::new());
}

/// The expected disclosures of the archived files fixture `001-told`.
fn told_disclosures() -> Vec<TaskDisclosure> {
    vec![
        TaskDisclosure {
            task: String::from("1"),
            deviated: Some(String::from(
                "- Kept the old name.\n  It reads better.\n\n- Split one file.",
            )),
            missing_context: None,
            outside_scope: Some(String::from("The listing skips hidden folders.")),
        },
        TaskDisclosure {
            task: String::from("2"),
            deviated: Some(String::from("Used a map.\n\nAnd a second deviation.")),
            missing_context: None,
            outside_scope: None,
        },
        TaskDisclosure {
            task: String::from("10"),
            deviated: None,
            missing_context: Some(String::from("Nonexistent file named in the task.")),
            outside_scope: Some(String::from("None\nThe second line keeps this section.")),
        },
    ]
}

/// Proves the disclosure reader on the files fixture's archived changes.
///
/// Covers: rust-storage/disclosure-reader-on-the-files-fixture
#[test]
fn disclosure_reader_on_the_files_fixture() {
    let archive =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/files/openspec/changes/archive");
    assert_eq!(
        read_result_disclosures(&archive.join("001-told")),
        told_disclosures()
    );
    assert_eq!(
        read_result_disclosures(&archive.join("002-silent")),
        Vec::<TaskDisclosure>::new()
    );
}
