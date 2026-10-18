//! Proves the manual record edges beyond the files fixture.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{ManualEdit, read_manual_edits};

/// A fresh temporary directory, with anything at that name removed.
fn temp(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// Proves the kept records, their order and every file left out.
///
/// Covers: rust-storage/records-of-the-files-fixture
#[test]
fn manual_record_edges() {
    let root = temp("manual_record_edges");
    let dir = root.join("openspec/manual");
    write(
        &dir.join("b.md"),
        "---\nkept_at: X\npaths: [src/b.rs]\ncapabilities:\n  - rust-core\n---\n  B  \n",
    );
    write(&dir.join("a.md"), "---\nkept_at: X\npaths: []\n---\nA\n");
    write(
        &dir.join("f.md"),
        "---\nkept_at: X\npaths:\n  - src/f.rs\n  - 3\ncapabilities: rust-core\n---\nF\n",
    );
    write(&dir.join("c.md"), "no frontmatter\n");
    write(
        &dir.join("d.md"),
        "---\nkept_at: 20261004\npaths: []\n---\nD\n",
    );
    write(
        &dir.join("e.md"),
        "---\nkept_at: X\npaths: src/e.rs\n---\nE\n",
    );
    write(&dir.join("h.md"), "---\nkept_at: [unclosed\n---\nH\n");
    write(&dir.join("readme.txt"), "not a record\n");
    fs::create_dir_all(dir.join("g.md")).unwrap();
    let expected = vec![
        ManualEdit {
            file: String::from("a.md"),
            kept_at: String::from("X"),
            paths: Vec::new(),
            capabilities: Vec::new(),
            comment: String::from("A"),
        },
        ManualEdit {
            file: String::from("b.md"),
            kept_at: String::from("X"),
            paths: vec![String::from("src/b.rs")],
            capabilities: vec![String::from("rust-core")],
            comment: String::from("B"),
        },
        ManualEdit {
            file: String::from("f.md"),
            kept_at: String::from("X"),
            paths: vec![String::from("src/f.rs")],
            capabilities: Vec::new(),
            comment: String::from("F"),
        },
    ];
    assert_eq!(read_manual_edits(&root), expected);
}

/// Proves a body-less record still reads, with an empty comment.
///
/// Covers: rust-storage/records-of-the-files-fixture
#[test]
fn manual_record_without_a_body() {
    let root = temp("manual_record_without_a_body");
    write(
        &root.join("openspec/manual/only.md"),
        "---\nkept_at: X\npaths: [p]\n---",
    );
    let records = read_manual_edits(&root);
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].comment, "");
    assert_eq!(records[0].paths, [String::from("p")]);
}
