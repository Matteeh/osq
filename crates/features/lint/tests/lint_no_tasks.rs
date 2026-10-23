//! Proves the findings for a change with no task files.

mod copy;
mod support;

use std::fs;
use std::path::Path;

use osq_core::FeatureError;

use support::{run, write};

/// The change the scenario adds to the fixture.
const CHANGE: &str = "openspec/changes/006-no-tasks";

/// One row: its extra files and the failure message lint gives.
struct Row {
    /// The scratch root's folder name for this row.
    name: &'static str,
    /// The files to write under the new change folder.
    files: Vec<(&'static str, String)>,
    /// The row's failure message.
    message: &'static str,
}

/// Every row of "Change with no task files", in the scenario's order.
fn rows() -> Vec<Row> {
    vec![
        Row {
            name: "no_tasks_folder",
            files: Vec::new(),
            message: "006-no-tasks: 2 findings\n\
                      006-no-tasks: error openspec/changes/006-no-tasks/tasks: tasks directory \
                      not found in change folder\n\
                      006-no-tasks: error openspec/changes/006-no-tasks/tasks: No task files \
                      found under tasks/",
        },
        Row {
            name: "no_markdown_file",
            files: vec![("tasks/notes.txt", "x\n".to_owned())],
            message: "006-no-tasks: 1 finding\n\
                      006-no-tasks: error openspec/changes/006-no-tasks/tasks: No task files \
                      found under tasks/",
        },
    ]
}

/// Proves every row of "Change with no task files" on its own copy.
///
/// Covers: rust-lint/change-with-no-task-files
#[test]
fn lint_no_tasks() {
    for row in rows() {
        let root = copy::fixture(&format!("lint_no_tasks/{}", row.name));
        add_change(&root, &row);
        assert_result(&root, &row);
    }
}

/// Adds the `006-no-tasks` change with the fixture's clean proposal and delta.
fn add_change(root: &Path, row: &Row) {
    let fixture = root.join("openspec/changes/001-clean");
    let proposal = fs::read(fixture.join("proposal.md")).expect("the fixture proposal is read");
    let delta = fs::read(fixture.join("specs/delta/spec.md")).expect("the fixture delta is read");
    write(root, &format!("{CHANGE}/proposal.md"), proposal);
    write(root, &format!("{CHANGE}/specs/delta/spec.md"), delta);
    for (path, contents) in &row.files {
        write(root, &format!("{CHANGE}/{path}"), contents);
    }
}

/// Checks one row's failure against the scratch root.
fn assert_result(root: &Path, row: &Row) {
    match run(root, "6") {
        Ok(output) => panic!("{}: expected a failure, got {output:?}", row.name),
        Err(FeatureError::Failed {
            command, message, ..
        }) => {
            assert_eq!(command, "lint", "{}: command", row.name);
            assert_eq!(message, row.message, "{}", row.name);
        }
        Err(other) => panic!("{}: expected a failed error, got {other:?}", row.name),
    }
}
