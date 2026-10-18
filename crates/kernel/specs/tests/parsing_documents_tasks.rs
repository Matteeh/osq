//! Document parser tests: task files, checklists and sidecars.

use osq_kernel_specs::{ChecklistItem, VerifyStarts, parse_task_file, parse_task_list};

/// One row of the "Task file fields" table.
struct TaskRow {
    /// The task file to parse.
    text: &'static str,
    /// The expected trimmed title.
    title: &'static str,
    /// The expected trimmed verify.
    verify: &'static str,
    /// The expected scope list.
    scope: &'static [&'static str],
    /// The expected entry list.
    entry: &'static [&'static str],
    /// The expected skills list.
    skills: &'static [&'static str],
    /// Whether the task may change preexisting tests.
    tests_modify: bool,
    /// The declared verify start.
    verify_starts: VerifyStarts,
    /// The expected acceptance lines.
    acceptance: &'static [&'static str],
}

/// Covers: rust-specs/task-file-fields
#[test]
fn task_file_fields() {
    let rows = [
        TaskRow {
            text: "---\ntitle: \" When a, b \"\nverify: cargo test\nverify_starts: green\ntests:\n  modify: true\nscope:\n  - a/**\n  - \" b.rs \"\n  - 5\nentry: [a/lib.rs]\nskills: []\n---\n## Acceptance\n\n- [ ] One.\n* [x] Two.\n- [X]   Three.  \n- [] not\n\n## Details\n- [ ] Not acceptance.\n",
            title: "When a, b",
            verify: "cargo test",
            scope: &["a/**", "b.rs", "5"],
            entry: &["a/lib.rs"],
            skills: &[],
            tests_modify: true,
            verify_starts: VerifyStarts::Green,
            acceptance: &["One.", "Two.", "Three."],
        },
        TaskRow {
            text: "---\ntitle: T\ntests.modify: true\nverify_starts: purple\n---\nNo acceptance heading.\n- [ ] Body item.\n",
            title: "T",
            verify: "",
            scope: &[],
            entry: &[],
            skills: &[],
            tests_modify: true,
            verify_starts: VerifyStarts::Red,
            acceptance: &["Body item."],
        },
        TaskRow {
            text: "---\ntitle: T\ntests:\n  modify: \"yes\"\ntests.modify: true\n---\n",
            title: "T",
            verify: "",
            scope: &[],
            entry: &[],
            skills: &[],
            tests_modify: true,
            verify_starts: VerifyStarts::Red,
            acceptance: &[],
        },
        TaskRow {
            text: "---\r\ntitle: CR\r\nscope: x\r\n---\r\n## Acceptance\r\n- [ ] Line.\r\n",
            title: "CR",
            verify: "",
            scope: &[],
            entry: &[],
            skills: &[],
            tests_modify: false,
            verify_starts: VerifyStarts::Red,
            acceptance: &["Line."],
        },
    ];
    for row in rows {
        let task = parse_task_file(row.text).expect("a task file");
        assert_eq!(row.title, task.title, "title of {:?}", row.text);
        assert_eq!(row.verify, task.verify, "verify of {:?}", row.text);
        assert_eq!(strings(row.scope), task.scope, "scope of {:?}", row.text);
        assert_eq!(strings(row.entry), task.entry, "entry of {:?}", row.text);
        assert_eq!(strings(row.skills), task.skills, "skills of {:?}", row.text);
        assert_eq!(
            row.tests_modify, task.tests_modify,
            "tests_modify of {:?}",
            row.text
        );
        assert_eq!(
            row.verify_starts, task.verify_starts,
            "verify_starts of {:?}",
            row.text
        );
        assert_eq!(
            strings(row.acceptance),
            task.acceptance,
            "acceptance of {:?}",
            row.text
        );
    }
}

/// One row of the "Checklist items" table.
struct ChecklistRow {
    /// The item's number, or `None`.
    number: Option<u32>,
    /// The item's title.
    title: &'static str,
    /// Whether the item is checked.
    checked: bool,
    /// The item's section, or `None`.
    section: Option<&'static str>,
    /// The item's 1-based line.
    line: usize,
}

/// Asserts one checklist item against a row.
fn assert_item(item: &ChecklistItem, row: &ChecklistRow) {
    assert_eq!(row.number, item.number, "number of {:?}", row.title);
    assert_eq!(row.title, item.title, "title");
    assert_eq!(row.checked, item.checked, "checked of {:?}", row.title);
    assert_eq!(
        row.section,
        item.section.as_deref(),
        "section of {:?}",
        row.title
    );
    assert_eq!(row.line, item.line, "line of {:?}", row.title);
}

/// Covers: rust-specs/checklist-items
#[test]
fn checklist_items() {
    let text = "# Tasks\n\n## 1. First\n\n- [ ] 1. When a, b\n- [x] 2) Second  \n\n## Other\n* [X] Unnumbered\n- [ ]3. tight\n   - [ ] 4. indented\n";
    let items = parse_task_list(text);
    let rows = [
        ChecklistRow {
            number: Some(1),
            title: "When a, b",
            checked: false,
            section: Some("1. First"),
            line: 5,
        },
        ChecklistRow {
            number: Some(2),
            title: "Second",
            checked: true,
            section: Some("1. First"),
            line: 6,
        },
        ChecklistRow {
            number: None,
            title: "Unnumbered",
            checked: true,
            section: Some("Other"),
            line: 9,
        },
    ];
    assert_eq!(rows.len(), items.len(), "item count");
    for (item, row) in items.iter().zip(&rows) {
        assert_item(item, row);
    }
}

/// Covers: rust-specs/checklist-items
#[test]
fn checklist_edges() {
    let rows = [
        (
            "## Section\n- [ ] No number\n",
            Some("Section"),
            None,
            "No number",
        ),
        (
            "##\tTabs\n* [X] 12) Twelve\n",
            Some("Tabs"),
            Some(12),
            "Twelve",
        ),
        (
            "- [ ] 1. no trailing title\n",
            None,
            Some(1),
            "no trailing title",
        ),
        ("- [ ] 1. \n", None, None, "1."),
        ("## A\n- [ ]\n", None, None, ""),
        ("### Not a section\n", None, None, ""),
    ];
    for (text, section, number, title) in rows {
        let items = parse_task_list(text);
        if title.is_empty() && number.is_none() && section.is_none() {
            assert!(items.is_empty(), "no item for {text:?}");
            continue;
        }
        let item = items
            .first()
            .unwrap_or_else(|| panic!("an item for {text:?}"));
        assert_eq!(section, item.section.as_deref(), "section of {text:?}");
        assert_eq!(number, item.number, "number of {text:?}");
        assert_eq!(title, item.title, "title of {text:?}");
    }
}

/// The owned texts of a slice of string literals.
fn strings(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| (*item).to_string()).collect()
}

/// Covers: rust-specs/task-file-fields
#[test]
fn task_file_edges() {
    let text = "---\ntitle: E\nverify_starts: any\nscope: [a, true, 5, null, 1.5]\n---\n- [x]Squashed\n- [ ] Kept.\n";
    let task = parse_task_file(text).expect("a task file");
    assert_eq!(VerifyStarts::Any, task.verify_starts);
    assert_eq!(strings(&["a", "true", "5", "null", "1.5"]), task.scope);
    assert_eq!(strings(&["Kept."]), task.acceptance);
}
