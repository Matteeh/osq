//! Proves reading a change folder's files as doctor's checks read them.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{ChangeFiles, DoneMarker, LockFile, read_change_files};

/// The text every file of a row holds unless the row says otherwise.
const TEXT: &str = r#"{"pid":1}"#;

/// A fresh temporary folder for one row, with nothing left at its name.
fn temp_folder(name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_change_files")
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).unwrap();
    folder
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// The lock at a folder-relative path with the row's pid.
fn lock(folder: &Path, relative: &str, pid: Option<i64>) -> LockFile {
    LockFile {
        path: folder.join(relative),
        pid,
    }
}

/// The done marker at a folder-relative path with the row's verified value.
fn marker(folder: &Path, relative: &str, verified: bool) -> DoneMarker {
    DoneMarker {
        path: folder.join(relative),
        verified,
    }
}

/// Writes a row's `.run/running/1.pid` and reads the folder's locks.
fn read_lock(name: &str, text: &str) -> (PathBuf, Vec<LockFile>) {
    let folder = temp_folder(name);
    write(&folder.join(".run/running/1.pid"), text);
    let locks = read_change_files(&folder).locks;
    (folder, locks)
}

/// Proves every row of "Lock pids".
///
/// Covers: rust-storage/lock-pids
#[test]
fn lock_pids() {
    let rows = [
        ("started_at", r#"{"pid":4242,"startedAt":1}"#, Some(4242)),
        ("negative", r#"{"pid":-1}"#, Some(-1)),
        ("string", r#"{"pid":"4242"}"#, None),
        ("fraction", r#"{"pid":1.5}"#, None),
        ("empty_object", "{}", None),
        ("array", "[4242]", None),
        ("not_json", "not json", None),
    ];
    for (name, text, pid) in rows {
        let (folder, locks) = read_lock(&format!("lock_{name}"), text);
        let expected = [lock(&folder, ".run/running/1.pid", pid)];
        assert_eq!(locks, expected, "row {name}");
    }
}

/// Writes a row's `.run/done/1.md` and reads the folder's done markers.
fn read_marker(name: &str, text: &str) -> (PathBuf, Vec<DoneMarker>) {
    let folder = temp_folder(name);
    write(&folder.join(".run/done/1.md"), text);
    let markers = read_change_files(&folder).done_markers;
    (folder, markers)
}

/// Proves every row of "Done marker kinds".
///
/// Covers: rust-storage/done-marker-kinds
#[test]
fn done_marker_kinds() {
    let rows = [
        ("hash", "---\nscope_hash: abc\n---\n", true),
        ("quoted_hash", "---\nscope_hash: \"12\"\n---\n", true),
        ("number_hash", "---\nscope_hash: 12\n---\n", false),
        (
            "manual",
            "---\nmanual: true\nreason: checked by hand\n---\n",
            true,
        ),
        (
            "quoted_manual",
            "---\nmanual: \"true\"\nreason: checked by hand\n---\n",
            false,
        ),
        ("no_reason", "---\nmanual: true\n---\n", false),
        (
            "number_reason",
            "---\nmanual: true\nreason: 3\n---\n",
            false,
        ),
        ("only_reason", "---\nreason: checked by hand\n---\n", false),
        ("no_frontmatter", "done\n", false),
        ("unparsable", "---\nscope_hash: [\n---\n", false),
    ];
    for (name, text, verified) in rows {
        let (folder, markers) = read_marker(&format!("marker_{name}"), text);
        let expected = [marker(&folder, ".run/done/1.md", verified)];
        assert_eq!(markers, expected, "row {name}");
    }
}

/// One entry a row writes into its change folder.
enum Entry<'a> {
    /// A file holding the row's text.
    File(&'a str),
    /// An empty folder.
    Folder,
}

/// One row of "Change folder file order and presence".
struct Row<'a> {
    /// The row's folder name.
    name: &'a str,
    /// The entries to write, folder-relative.
    entries: &'a [(&'a str, Entry<'a>)],
    /// The expected proposal presence.
    has_proposal: bool,
    /// The expected task presence.
    has_tasks: bool,
    /// The expected locks, folder-relative, with their pids.
    locks: &'a [(&'a str, Option<i64>)],
    /// The expected done markers, folder-relative, with their verified values.
    done_markers: &'a [(&'a str, bool)],
}

/// Every row of "Change folder file order and presence".
fn presence_rows() -> [Row<'static>; 6] {
    [
        Row {
            name: "none",
            entries: &[],
            has_proposal: false,
            has_tasks: false,
            locks: &[],
            done_markers: &[],
        },
        Row {
            name: "proposal_and_task_file",
            entries: &[
                ("proposal.md", Entry::File(TEXT)),
                ("tasks/1.md", Entry::File(TEXT)),
            ],
            has_proposal: true,
            has_tasks: true,
            locks: &[],
            done_markers: &[],
        },
        Row {
            name: "spec_and_tasks_file",
            entries: &[
                ("spec.md", Entry::File(TEXT)),
                ("tasks.md", Entry::File(TEXT)),
            ],
            has_proposal: true,
            has_tasks: true,
            locks: &[],
            done_markers: &[],
        },
        Row {
            name: "folders",
            entries: &[("proposal.md", Entry::Folder), ("tasks.md", Entry::Folder)],
            has_proposal: true,
            has_tasks: true,
            locks: &[],
            done_markers: &[],
        },
        Row {
            name: "locks",
            entries: &[
                (".run/running/2.pid", Entry::File(TEXT)),
                (".run/running/10.pid", Entry::File(TEXT)),
                (".run/running/notes.txt", Entry::File(TEXT)),
                (".run/locks/1.pid", Entry::File(TEXT)),
                (".run/running/3.pid", Entry::Folder),
            ],
            has_proposal: false,
            has_tasks: false,
            locks: &[
                (".run/running/10.pid", Some(1)),
                (".run/running/2.pid", Some(1)),
                (".run/running/3.pid", None),
                (".run/locks/1.pid", Some(1)),
            ],
            done_markers: &[],
        },
        Row {
            name: "done_markers",
            entries: &[
                (".run/done/2.md", Entry::File("done")),
                (".run/done/10.md", Entry::File("done")),
                (".run/done/3.md", Entry::Folder),
            ],
            has_proposal: false,
            has_tasks: false,
            locks: &[],
            done_markers: &[
                (".run/done/10.md", false),
                (".run/done/2.md", false),
                (".run/done/3.md", false),
            ],
        },
    ]
}

/// Writes a row's entries and reads the folder's files.
fn read_row(row: &Row) -> (PathBuf, ChangeFiles) {
    let folder = temp_folder(&format!("presence_{}", row.name));
    for (relative, entry) in row.entries {
        match entry {
            Entry::File(text) => write(&folder.join(relative), text),
            Entry::Folder => fs::create_dir_all(folder.join(relative)).unwrap(),
        }
    }
    let files = read_change_files(&folder);
    (folder, files)
}

/// Proves every row of "Change folder file order and presence".
///
/// Covers: rust-storage/change-folder-file-order-and-presence
#[test]
fn change_folder_file_order_and_presence() {
    for row in presence_rows() {
        let (folder, files) = read_row(&row);
        let expected = ChangeFiles {
            has_proposal: row.has_proposal,
            has_tasks: row.has_tasks,
            locks: row
                .locks
                .iter()
                .map(|(relative, pid)| lock(&folder, relative, *pid))
                .collect(),
            done_markers: row
                .done_markers
                .iter()
                .map(|(relative, verified)| marker(&folder, relative, *verified))
                .collect(),
        };
        assert_eq!(files, expected, "row {}", row.name);
    }
}
