//! Proves reading one change folder's task marker facts for the report counts.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{NowFacts, NowTask, read_now_facts};

/// One entry a row writes into its change folder.
enum Entry {
    /// A file holding the given text.
    File(&'static str),
    /// An empty folder.
    Folder,
}

/// A fresh temporary folder for one row, with nothing left at its name.
fn temp_folder(test: &str, name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_now_facts")
        .join(test)
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

/// Writes every entry, folder-relative, into a scratch folder.
fn fill(folder: &Path, entries: &[(&str, Entry)]) {
    for (relative, entry) in entries {
        match entry {
            Entry::File(text) => write(&folder.join(relative), text),
            Entry::Folder => fs::create_dir_all(folder.join(relative)).unwrap(),
        }
    }
}

/// The expected task with an id and its flags: done, manual, dead, regressed,
/// running.
fn task(id: &str, [done, manual, dead, regressed, running]: [bool; 5]) -> NowTask {
    NowTask {
        id: id.to_owned(),
        done,
        manual,
        dead,
        regressed,
        running,
    }
}

/// Proves every row of "Now facts of a change folder".
///
/// Covers: rust-storage/now-facts-of-a-change-folder
#[test]
fn now_facts_of_a_change_folder() {
    let folder = temp_folder("now_facts_of_a_change_folder", "folder");
    fill(
        &folder,
        &[
            ("proposal.md", Entry::File("")),
            ("tasks/1.md", Entry::File("")),
            ("tasks/10.md", Entry::File("")),
            ("tasks/2.md", Entry::File("")),
            ("tasks/3.md", Entry::File("")),
            ("tasks/4.md", Entry::Folder),
            ("tasks/notes.txt", Entry::File("")),
            (".run/done/1", Entry::File("---\nmanual: true\n---\n")),
            (
                ".run/done/2",
                Entry::File("---\nmanual: \"true\"\nreason: by hand\n---\n"),
            ),
            (".run/done/3", Entry::File("done\n")),
            (".run/done/4", Entry::Folder),
            (".run/dead/2.md", Entry::File("")),
            (".run/dead/3.1.md", Entry::File("")),
            (".run/regressed/3.md", Entry::File("")),
            (".run/regressed/change.md", Entry::File("")),
            (".run/running/10.pid", Entry::File("not json\n")),
        ],
    );
    let expected = NowFacts {
        has_proposal: true,
        tasks: vec![
            task("1", [true, true, false, false, false]),
            task("10", [false, false, false, false, true]),
            task("2", [true, false, true, false, false]),
            task("3", [true, false, false, true, false]),
            task("4", [true, false, false, false, false]),
        ],
    };
    assert_eq!(read_now_facts(&folder), expected);
}

/// One row of "Now facts edges".
struct Row {
    /// The row's folder name.
    name: &'static str,
    /// The entries to write, folder-relative.
    entries: &'static [(&'static str, Entry)],
    /// The expected proposal presence.
    has_proposal: bool,
    /// The expected tasks.
    tasks: Vec<NowTask>,
}

/// Proves every row of "Now facts edges".
///
/// Covers: rust-storage/now-facts-edges
#[test]
fn now_facts_edges() {
    let rows = [
        Row {
            name: "none",
            entries: &[],
            has_proposal: false,
            tasks: Vec::new(),
        },
        Row {
            name: "spec_and_task",
            entries: &[
                ("spec.md", Entry::File("")),
                ("tasks/1.md", Entry::File("")),
            ],
            has_proposal: true,
            tasks: vec![task("1", [false, false, false, false, false])],
        },
        Row {
            name: "unparsable_done",
            entries: &[
                ("tasks/1.md", Entry::File("")),
                (".run/done/1", Entry::File("---\nmanual: [\n---\n")),
            ],
            has_proposal: false,
            tasks: vec![task("1", [true, false, false, false, false])],
        },
        Row {
            name: "manual_done",
            entries: &[
                ("proposal.md", Entry::File("")),
                ("tasks/1.md", Entry::File("")),
                (
                    ".run/done/1",
                    Entry::File("---\nmanual: true\nreason: 3\n---\n"),
                ),
            ],
            has_proposal: true,
            tasks: vec![task("1", [true, true, false, false, false])],
        },
        Row {
            name: "tasks_file",
            entries: &[
                ("proposal.md", Entry::File("")),
                ("tasks.md", Entry::File("")),
            ],
            has_proposal: true,
            tasks: Vec::new(),
        },
    ];
    for row in rows {
        let folder = temp_folder("now_facts_edges", row.name);
        fill(&folder, row.entries);
        let expected = NowFacts {
            has_proposal: row.has_proposal,
            tasks: row.tasks,
        };
        assert_eq!(read_now_facts(&folder), expected, "row {}", row.name);
    }
}
