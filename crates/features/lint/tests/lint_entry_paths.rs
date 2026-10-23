//! Proves the entry path findings the task rules give before their warnings.

mod copy;
mod support;

use std::fmt::Write as _;
use std::path::Path;

use osq_core::FeatureError;

use support::{run, write};

/// The task file every row writes unless it writes its own.
const TASK: &str = "openspec/changes/001-clean/tasks/1.md";
/// The second task file the ordering rows write.
const TASK_TWO: &str = "openspec/changes/001-clean/tasks/2.md";
/// The tenth task file the ordering rows write.
const TASK_TEN: &str = "openspec/changes/001-clean/tasks/10.md";
/// The other change's task file that provides an entry.
const OTHER: &str = "openspec/changes/007-other/tasks/1.md";
/// The entry finding prefix for task `1.md`.
const ENTRY_ONE: &str =
    "001-clean: error openspec/changes/001-clean/tasks/1.md: Task 1 entry names";
/// The task error prefix for task `1.md`.
const TASK_ONE: &str = "001-clean: error openspec/changes/001-clean/tasks/1.md: Task in 1.md";
/// The clean verify command.
const VERIFY: &str = "verify: cargo test -p delta";
/// The brace group message tail.
const BRACE: &str = "holds a brace group, which osq scope globs do not expand; they support \
                     only *, **, ? and a trailing /. Use a folder glob such as dir/** or one \
                     entry per file";

/// One row: its files and either its output or its failure message.
struct Row {
    /// The scratch root's folder name for this row.
    name: &'static str,
    /// The files to write over the copied fixture.
    files: Vec<(&'static str, String)>,
    /// The row's output or failure message.
    result: Result<String, String>,
}

/// A task file whose entry is `entry`.
fn task(entry: &str) -> String {
    format!(
        "---\ntitle: T\n{VERIFY}\nscope:\n  - crates/delta/src/lib.rs\nentry:\n  - {entry}\n---\n\
         - [ ] a\n"
    )
}

/// A task file with custom scope entries and `entry` entries.
fn scoped(scope: &[&str], entry: &[&str]) -> String {
    let mut text = format!("---\ntitle: T\n{VERIFY}\nscope:\n");
    for item in scope {
        let _ = writeln!(text, "  - {item}");
    }
    text.push_str("entry:\n");
    for item in entry {
        let _ = writeln!(text, "  - {item}");
    }
    text.push_str("---\n- [ ] a\n");
    text
}

/// The other change's task file, whose scope creates `crates/delta/src/made.rs`.
fn other() -> String {
    "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/src/made.rs\n---\n- [ \
     ] a\n"
        .to_owned()
}

/// A finding for one missing entry in the project.
fn missing(entry: &str) -> String {
    format!(
        "001-clean: 1 finding\n{ENTRY_ONE} {entry}, which is not in the project and no task \
             up to this one creates"
    )
}

/// Every row of "Entry path findings", in the scenario's order.
fn rows_scenario() -> Vec<Row> {
    vec![
        Row {
            name: "provided_by_tree",
            files: vec![(TASK, task("crates/delta/src/lib.rs"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "missing_file",
            files: vec![(TASK, task("crates/delta/src/gone.rs"))],
            result: Err(missing("crates/delta/src/gone.rs")),
        },
        Row {
            name: "tree_folder",
            files: vec![(TASK, task("crates/delta/src"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "tree_pattern",
            files: vec![(TASK, task("crates/**/*.rs"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "tree_pattern_misses",
            files: vec![(TASK, task("crates/**/*.py"))],
            result: Err(missing("crates/**/*.py")),
        },
        Row {
            name: "change_folder_file",
            files: vec![(TASK, task("openspec/changes/001-clean/specs/delta/spec.md"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "change_folder_missing",
            files: vec![(TASK, task("openspec/changes/001-clean/notes.md"))],
            result: Err(missing("openspec/changes/001-clean/notes.md")),
        },
        Row {
            name: "approved_change",
            files: vec![
                (OTHER, other()),
                ("openspec/changes/007-other/.run/approved", "x\n".to_owned()),
                (TASK, task("crates/delta/src/made.rs")),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "unapproved_change",
            files: vec![(OTHER, other()), (TASK, task("crates/delta/src/made.rs"))],
            result: Err(missing("crates/delta/src/made.rs")),
        },
        Row {
            name: "own_scope",
            files: vec![(
                TASK,
                scoped(&["crates/delta/src/made.rs"], &["crates/delta/src/made.rs"]),
            )],
            result: Ok("001-clean: valid\n".to_owned()),
        },
    ]
}

/// Extra rows covering the providers and forms the scenario table leaves implicit.
fn rows_extra() -> Vec<Row> {
    let mut rows = rows_extra_change_folder();
    rows.extend(rows_extra_providers());
    rows.extend(rows_extra_skips());
    rows.extend(rows_extra_errors());
    rows.extend(rows_extra_order());
    rows
}

/// The change-folder provider's path forms.
fn rows_extra_change_folder() -> Vec<Row> {
    vec![
        Row {
            name: "root_resolved_entry",
            files: vec![(
                TASK,
                task("./openspec/changes/001-clean/specs/delta/spec.md"),
            )],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "root_resolved_parent",
            files: vec![(
                TASK,
                task("./openspec/changes/001-clean/../001-clean/specs/delta/spec.md"),
            )],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "change_folder_pattern",
            files: vec![(TASK, task("openspec/changes/001-clean/specs/**"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "change_folder_folder",
            files: vec![(TASK, task("openspec/changes/001-clean/specs/delta"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "change_folder_trailing_slash",
            files: vec![(TASK, task("openspec/changes/001-clean/specs/"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "change_folder_pattern_misses",
            files: vec![(TASK, task("openspec/changes/001-clean/gone/**"))],
            result: Err(missing("openspec/changes/001-clean/gone/**")),
        },
        Row {
            name: "outside_project",
            files: vec![(TASK, task("../osq-entry-missing"))],
            result: Err(missing("../osq-entry-missing")),
        },
        Row {
            name: "absolute_path",
            files: vec![(TASK, task("/osq-entry-missing"))],
            result: Err(missing("/osq-entry-missing")),
        },
        Row {
            name: "tree_trailing_slash",
            files: vec![(TASK, task("crates/"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
    ]
}

/// The scope and other-change providers.
fn rows_extra_providers() -> Vec<Row> {
    vec![
        Row {
            name: "earlier_scope",
            files: vec![
                (TASK, scoped(&["scripts/new.sh"], &[])),
                (
                    TASK_TWO,
                    "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - \
                     crates/delta/src/lib.rs\nentry:\n  - scripts/new.sh\n---\n- [ ] a\n"
                        .to_owned(),
                ),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "archived_change",
            files: vec![
                (OTHER, other()),
                (
                    "openspec/changes/archive/007-other/.run/approved",
                    "x\n".to_owned(),
                ),
                (TASK, task("crates/delta/src/made.rs")),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "approved_elsewhere",
            files: vec![
                (OTHER, other()),
                (
                    "openspec/changes/archive/007-other/.run/approved",
                    "x\n".to_owned(),
                ),
                (TASK, task("crates/delta/src/made.rs")),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "rejected_change",
            files: vec![
                ("openspec/changes/rejected/007-other/tasks/1.md", other()),
                (
                    "openspec/changes/rejected/007-other/.run/approved",
                    "x\n".to_owned(),
                ),
                (TASK, task("crates/delta/src/made.rs")),
            ],
            result: Err(missing("crates/delta/src/made.rs")),
        },
        Row {
            name: "other_pattern_scope",
            files: vec![
                (
                    OTHER,
                    "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/**\n---\n- [ \
                     ] a\n"
                        .to_owned(),
                ),
                ("openspec/changes/007-other/.run/approved", "x\n".to_owned()),
                (TASK, task("crates/delta/src/made.rs")),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "approved_without_scope",
            files: vec![
                (
                    OTHER,
                    "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - \
                     crates/delta/src/lib.rs\n---\n- [ ] a\n"
                        .to_owned(),
                ),
                ("openspec/changes/007-other/.run/approved", "x\n".to_owned()),
                (TASK, task("crates/delta/src/made.rs")),
            ],
            result: Err(missing("crates/delta/src/made.rs")),
        },
        Row {
            name: "change_folder_other_file",
            files: vec![
                ("openspec/changes/001-clean/xyzzy", "x\n".to_owned()),
                (TASK, task("crates/delta/src/gone.rs")),
            ],
            result: Err(missing("crates/delta/src/gone.rs")),
        },
    ]
}

/// The tasks the entry rule skips and the order it reads them in.
fn rows_extra_skips() -> Vec<Row> {
    vec![
        Row {
            name: "brace_scope_only",
            files: vec![(
                TASK,
                scoped(
                    &["crates/delta/src/{a,b}.rs"],
                    &["crates/delta/src/gone.rs"],
                ),
            )],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE} scope entry \
                 \"crates/delta/src/{{a,b}}.rs\" {BRACE}"
            )),
        },
        Row {
            name: "brace_open_nested",
            files: vec![(
                TASK,
                scoped(&["crates/{a,b{c}/x.rs"], &["crates/delta/src/gone.rs"]),
            )],
            result: Err(missing("crates/delta/src/gone.rs")),
        },
        Row {
            name: "brace_group_task",
            files: vec![(
                TASK,
                scoped(
                    &["crates/delta/src/{a,b}.rs"],
                    &["crates/{x,y}/lib.rs", "crates/**/entry"],
                ),
            )],
            result: Err(format!(
                "001-clean: 2 findings\n\
                 {TASK_ONE} scope entry \"crates/delta/src/{{a,b}}.rs\" {BRACE}\n\
                 {TASK_ONE} entry \"crates/{{x,y}}/lib.rs\" {BRACE}"
            )),
        },
    ]
}

/// The task errors that sit before the entry findings.
fn rows_extra_errors() -> Vec<Row> {
    vec![
        Row {
            name: "task_error_before_entry",
            files: vec![(
                TASK,
                "---\ntitle: T\nverify:\nscope:\n  - crates/delta/src/lib.rs\nentry:\n  - \
                 crates/gone.rs\n---\n- [ ] a\n"
                    .to_owned(),
            )],
            result: Err(format!(
                "001-clean: 2 findings\n{TASK_ONE} verify command is empty\n{ENTRY_ONE} \
                 crates/gone.rs, which is not in the project and no task up to this one creates"
            )),
        },
        Row {
            name: "invalid_frontmatter_task",
            files: vec![(
                TASK,
                "---\ntitle: T\nverify: [\nentry:\n  - crates/delta/src/gone.rs\n---\n- [ ] a\n"
                    .to_owned(),
            )],
            result: Err(format!(
                "001-clean: 1 finding\n{TASK_ONE} frontmatter is not valid YAML at line 4: invalid indentation at byte 19 line 3 column 1"
            )),
        },
    ]
}

/// The order the entry rule reads task files in.
fn rows_extra_order() -> Vec<Row> {
    vec![Row {
        name: "task_number_order",
        files: vec![
            (TASK, scoped(&["scripts/none.sh"], &[])),
            (
                TASK_TWO,
                scoped(&["crates/delta/Cargo.toml"], &["crates/gone-two.rs"]),
            ),
            (
                TASK_TEN,
                scoped(&["crates/delta/src/lib.rs"], &["crates/gone-ten.rs"]),
            ),
        ],
        result: Err("001-clean: 2 findings\n\
                 001-clean: error openspec/changes/001-clean/tasks/2.md: Task 2 entry names \
                 crates/gone-two.rs, which is not in the project and no task up to this one \
                 creates\n\
                 001-clean: error openspec/changes/001-clean/tasks/10.md: Task 10 entry names \
                 crates/gone-ten.rs, which is not in the project and no task up to this one \
                 creates"
            .to_owned()),
    }]
}

/// Proves every row of "Entry path findings" on its own copy.
///
/// Covers: rust-lint/entry-path-findings
#[test]
fn lint_entry_paths() {
    prove(rows_scenario(), "lint_entry_paths");
}

/// Proves the entry providers, path forms and skipped tasks.
///
/// Covers: rust-lint/entry-path-findings
#[test]
fn lint_entry_path_edges() {
    prove(rows_extra(), "lint_entry_path_edges");
}

/// Runs every row on its own scratch copy and checks its result.
fn prove(rows: Vec<Row>, prefix: &str) {
    for row in rows {
        let root = copy::fixture(&format!("{prefix}/{}", row.name));
        write(&root, TASK, task("crates/delta/src/lib.rs"));
        for (path, contents) in &row.files {
            write(&root, path, contents);
        }
        assert_result(&root, &row);
    }
}

/// Checks one row's output or failure against the scratch root.
fn assert_result(root: &Path, row: &Row) {
    match (run(root, "1"), &row.result) {
        (Ok(output), Ok(text)) => assert_eq!(&output.text, text, "{}", row.name),
        (Err(error), Err(text)) => match error {
            FeatureError::Failed {
                command, message, ..
            } => {
                assert_eq!(command, "lint", "{}: command", row.name);
                assert_eq!(&message, text, "{}", row.name);
            }
            other => panic!("{}: expected a failed error, got {other:?}", row.name),
        },
        (result, _) => panic!("{}: unexpected result {result:?}", row.name),
    }
}
