//! Proves reading `openspec/queue.md` into the slugs and titles of its items.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{QueueTitle, read_queue_titles};

/// A fresh temporary project root for one row, with nothing left at its name.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_queue_titles")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// Writes the row's `openspec/queue.md`.
fn write_queue(root: &Path, text: &str) {
    let folder = root.join("openspec");
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("queue.md"), text).unwrap();
}

/// A queue title with its slug and title.
fn title(slug: &str, text: &str) -> QueueTitle {
    QueueTitle {
        slug: String::from(slug),
        title: String::from(text),
    }
}

/// The `## [a] A` item with a complete body, used as a prefix.
const OK_A: &str = "## [a] A\n\nDepends on: nothing\n\nBody.\n\n";

/// The queue rows that read, with their titles.
fn accepted_rows() -> Vec<(&'static str, String, Vec<QueueTitle>)> {
    vec![
        (
            "two items",
            String::from(
                "# Queue\n\nPreamble.\n\n## [first] First item\n\nDepends on: nothing\n\nBody.\n\n## [second] Second item  \n\nDepends on: first\nFixes: first\n\nBody.\n\n",
            ),
            vec![title("first", "First item"), title("second", "Second item")],
        ),
        (
            "carriage returns",
            String::from("## [first] First\r\n\r\nDepends on: nothing\r\n\r\nBody.\r\n"),
            vec![title("first", "First")],
        ),
        (
            "hyphen slug",
            String::from("## [a-b] Hyphen\n\nDepends on: nothing\n\nBody.\n"),
            vec![title("a-b", "Hyphen")],
        ),
        (
            "tabs",
            String::from("##\t[first]\tFirst\n\nDepends on: nothing\n\nBody.\n"),
            vec![title("first", "First")],
        ),
    ]
}

/// The queue rows whose heading or slug is malformed.
fn refused_heading_rows() -> Vec<(&'static str, String, Vec<QueueTitle>)> {
    vec![
        (
            "no space after hashes",
            String::from("##[first] First\n\nDepends on: nothing\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "bad slug",
            String::from("## [Bad_Slug] Title\n\nDepends on: nothing\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "empty title",
            String::from("## [first]   \n\nDepends on: nothing\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "repeated slug",
            format!("{OK_A}## [a] Again\n\nDepends on: nothing\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "double hyphen slug",
            String::from("## [a--b] Double\n\nDepends on: nothing\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "carriage return in title",
            String::from("## [first] Ti\rX\n\nDepends on: nothing\n\nBody.\n"),
            Vec::new(),
        ),
    ]
}

/// The queue rows whose dependency, fixes or body is malformed.
fn refused_body_rows() -> Vec<(&'static str, String, Vec<QueueTitle>)> {
    vec![
        (
            "no dependency line",
            String::from("## [first] First\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "empty dependency line",
            String::from("## [first] First\n\nDepends on:\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "later dependency",
            String::from("## [first] First\n\nDepends on: later\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "own dependency",
            String::from("## [first] First\n\nDepends on: first\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "repeated dependency",
            format!("{OK_A}## [b] B\n\nDepends on: a, a\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "uppercase dependency",
            format!("{OK_A}## [b] B\n\nDepends on: A\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "empty fixes line",
            format!("{OK_A}## [b] B\n\nDepends on: nothing\nFixes:\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "later fix",
            format!("{OK_A}## [b] B\n\nDepends on: nothing\nFixes: later\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "repeated fix",
            format!("{OK_A}## [b] B\n\nDepends on: nothing\nFixes: a, a\n\nBody.\n"),
            Vec::new(),
        ),
        (
            "empty body",
            String::from("## [first] First\n\nDepends on: nothing\n\n"),
            Vec::new(),
        ),
        (
            "second dependency line",
            String::from(
                "## [first] First\n\nDepends on: nothing\n\nBody.\n\nDepends on: nothing\n",
            ),
            Vec::new(),
        ),
        (
            "second fixes line",
            format!("{OK_A}## [b] B\n\nDepends on: nothing\nFixes: a\n\nBody.\n  Fixes: a\n"),
            Vec::new(),
        ),
    ]
}

/// Proves every row of "Queue titles".
///
/// Covers: rust-storage/queue-titles
#[test]
fn queue_titles() {
    let rows = accepted_rows()
        .into_iter()
        .chain(refused_heading_rows())
        .chain(refused_body_rows());
    for (name, text, expected) in rows {
        let root = temp_root(name);
        write_queue(&root, &text);
        assert_eq!(read_queue_titles(&root), expected, "row {name}");
    }
}

/// Proves a project without a queue file reads no title.
///
/// Covers: rust-storage/no-queue-file
#[test]
fn no_queue_file() {
    let root = temp_root("no_queue");
    assert_eq!(read_queue_titles(&root), Vec::new());
}
