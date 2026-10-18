//! Proves the section heading and `None` edges beyond the scenario table.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{
    ChangeEntry, Location, ResultSections, parse_result_sections, read_change,
};

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

/// One named section of a parsed result, or its absence.
fn named<'a>(sections: &'a ResultSections, name: &str) -> Option<&'a str> {
    match name {
        "changed" => sections.changed.as_deref(),
        "deviated" => sections.deviated.as_deref(),
        "missing_context" => sections.missing_context.as_deref(),
        "outside_scope" => sections.outside_scope.as_deref(),
        "blocked" => sections.blocked.as_deref(),
        "next" => sections.next.as_deref(),
        "touched" => sections.touched.as_deref(),
        other => panic!("unknown section {other}"),
    }
}

/// Proves heading case, spacing, colons, a carriage return and unknown names.
///
/// Covers: rust-storage/section-cases
#[test]
fn heading_edges() {
    let rows: [(&str, &str, Option<&str>); 10] = [
        ("## Deviated\r\nOne.\r\n", "deviated", Some("One.")),
        ("## Deviated :\nOne.\n", "deviated", Some("One.")),
        ("## OUTSIDE SCOPE\nX\n", "outside_scope", Some("X")),
        ("TOUCHED: x\n", "touched", Some("x")),
        ("touched : a, b\n", "touched", Some("a, b")),
        ("## Touched:\nInline.\n", "touched", Some("Inline.")),
        ("Touched: x\nbody\n", "touched", Some("x")),
        ("touched src\n", "touched", None),
        ("## Outside scope\n##Tight\nBody.\n", "outside_scope", None),
        ("## Deviated\nOne.\n#\nTwo.\n", "deviated", Some("One.")),
    ];
    for (text, name, value) in rows {
        let sections = parse_result_sections(text);
        assert_eq!(named(&sections, name), value, "section {name} of {text:?}");
    }
}

/// Proves a line that merely starts with `touched` stays body text.
///
/// Covers: rust-storage/section-cases
#[test]
fn a_longer_word_is_body_text() {
    let sections = parse_result_sections("## Deviated\nOne.\ntouchedness\nTwo.\n");
    assert_eq!(
        sections.deviated.as_deref(),
        Some("One.\ntouchedness\nTwo.")
    );
}

/// Proves every list marker and `None` spelling that reads as absent.
///
/// Covers: rust-storage/section-cases
#[test]
fn none_and_list_markers() {
    for text in [
        "## Deviated\n* None\n",
        "## Deviated\n+ None\n",
        "## Deviated\n1. None\n",
        "## Deviated\n- None.\n",
        "## Deviated\n1.None\n",
        "## Deviated\n_None_\n",
        "## Deviated\nN*o*n*e\n",
        "## Deviated\nNONE\n",
        "## Deviated\nnone:\n",
        "## Deviated\nNone\n\n",
    ] {
        assert_eq!(
            parse_result_sections(text).deviated,
            None,
            "section of {text:?}"
        );
    }
}

/// Proves text that is not `None` and not empty stays.
///
/// Covers: rust-storage/section-cases
#[test]
fn non_none_text_stays() {
    for text in [
        "## Deviated\n.Not a marker.\n",
        "## Deviated\n1None\n",
        "## Deviated\nnone)\n",
        "## Deviated\nNone\nSecond\n",
    ] {
        assert!(
            parse_result_sections(text).deviated.is_some(),
            "section of {text:?}"
        );
    }
}

/// Proves result files are picked, sorted and named by their own names.
///
/// Covers: rust-storage/disclosures-of-the-files-fixture
#[test]
fn disclosure_edges() {
    let root = temp("disclosure_edges");
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join(".run/results/10.md"), "## Deviated\nTen.\n");
    write(&dir.join(".run/results/2.md"), "## Missing context\nTwo.\n");
    write(&dir.join(".run/results/01.md"), "## Outside scope\nOne.\n");
    write(&dir.join(".run/results/notes.md"), "## Deviated\nNotes.\n");
    write(&dir.join(".run/results/3.txt"), "## Deviated\nText.\n");
    write(&dir.join(".run/results/.md"), "## Deviated\nEmpty.\n");
    write(&dir.join(".run/results/4.md"), "## Blocked\nNone.\n");
    let snapshot = read_change(&ChangeEntry {
        folder: String::from("001-x"),
        location: Location::Archived,
        path: dir,
    })
    .unwrap();
    let names: Vec<&str> = snapshot
        .disclosures
        .iter()
        .map(|disclosure| disclosure.task.as_str())
        .collect();
    assert_eq!(names, ["01", "2", "10"]);
    assert_eq!(
        snapshot.disclosures[0].outside_scope.as_deref(),
        Some("One.")
    );
    assert_eq!(
        snapshot.disclosures[1].missing_context.as_deref(),
        Some("Two.")
    );
    assert_eq!(snapshot.disclosures[2].deviated.as_deref(), Some("Ten."));
}
