//! Proves task checkboxes tick as TypeScript's do.

use osq_feature_run::tick_task_checkbox;

/// Proves every row of "Ticked task lists".
///
/// Covers: rust-run/ticked-task-lists
#[test]
fn ticked_task_lists() {
    let rows: [(&str, &str, &str); 8] = [
        (
            "# Tasks\n\n- [ ] 1. A\n- [ ] 2. B\n",
            "2",
            "# Tasks\n\n- [ ] 1. A\n- [x] 2. B\n",
        ),
        ("- [ ] 1) A\n", "1", "- [x] 1) A\n"),
        ("  - [ ] 01. A", "1", "  - [x] 01. A"),
        (
            "## 1. Setup\n\n- [ ] A\n- [ ] B\n## 2. More\n- [ ] C\n",
            "1",
            "## 1. Setup\n\n- [x] A\n- [x] B\n## 2. More\n- [ ] C\n",
        ),
        (
            "## 1. Setup\n## Notes\n- [ ] A\n",
            "1",
            "## 1. Setup\n## Notes\n- [ ] A\n",
        ),
        (
            "- [X] 1. A\n- [ ] 1. again\n",
            "1",
            "- [X] 1. A\n- [x] 1. again\n",
        ),
        ("- [ ] 1. A\n", "x", "- [ ] 1. A\n"),
        ("- [ ] 2. A\n", "1", "- [ ] 2. A\n"),
    ];
    for (index, (text, task, expected)) in rows.into_iter().enumerate() {
        assert_eq!(tick_task_checkbox(text, task), expected, "row {index}");
    }
}

/// Proves line endings, leading zeros and numbers outside the table.
///
/// Covers: rust-run/ticked-task-lists
#[test]
fn edge_rows() {
    let rows: [(&str, &str, &str); 9] = [
        (
            "- [ ] 1. A\r\n- [ ] 2. B\r\n",
            "1",
            "- [x] 1. A\r\n- [ ] 2. B\r\n",
        ),
        (
            "## 01. Setup\n- [x] A\n- [ ] B",
            "1",
            "## 01. Setup\n- [x] A\n- [x] B",
        ),
        ("## 1) Setup\n- [ ] A\n", "1", "## 1) Setup\n- [x] A\n"),
        ("- [ ] 001. A\n", "01", "- [x] 001. A\n"),
        ("- [ ] 1. A\n", "  +01x", "- [x] 1. A\n"),
        ("- [ ] 1. A\n", "-1", "- [ ] 1. A\n"),
        (
            "## 1. Setup\n- [ ] A\n##   \n- [ ] B\n",
            "1",
            "## 1. Setup\n- [x] A\n##   \n- [x] B\n",
        ),
        ("-  [ ] 1. A\n", "1", "-  [x] 1. A\n"),
        ("## 1\rSetup\n- [ ] A\n", "1", "## 1\rSetup\n- [ ] A\n"),
    ];
    for (index, (text, task, expected)) in rows.into_iter().enumerate() {
        assert_eq!(tick_task_checkbox(text, task), expected, "row {index}");
    }
}
