//! Reading the tasks the flag rules see.

use std::fs;
use std::path::Path;

use osq_kernel_specs::{VerifyStarts, parse_task_file};

use crate::model::Change;

use super::TaskView;
use super::paths;

/// Reads every task in task-number order with its resolved scope paths.
pub(super) fn read(root: &Path, change: &Change) -> Vec<TaskView> {
    let mut views: Vec<TaskView> = change
        .tasks
        .iter()
        .map(|task| view(root, change, task))
        .collect();
    views.sort_by(|left, right| compare_numbers(&left.number, &right.number));
    views
}

/// Builds one task's view, falling back to the model when its file does not parse.
fn view(root: &Path, change: &Change, task: &crate::model::Task) -> TaskView {
    let path = change
        .path
        .join("tasks")
        .join(format!("{}.md", task.number));
    let parsed = fs::read_to_string(path)
        .ok()
        .and_then(|text| parse_task_file(&text).ok());
    let (verify, scope, starts, tests_modify) = parsed.map_or_else(
        || {
            (
                task.verify.clone(),
                task.scope.clone(),
                VerifyStarts::Red,
                false,
            )
        },
        |parsed| {
            (
                parsed.verify,
                parsed.scope,
                parsed.verify_starts,
                parsed.tests_modify,
            )
        },
    );
    let paths = paths::resolved(root, &scope);
    TaskView {
        number: task.number.clone(),
        verify,
        starts,
        scope,
        paths,
        tests_modify,
    }
}

/// Compares task numbers as TypeScript's `compareTaskNumbers` does.
pub(super) fn compare_numbers(left: &str, right: &str) -> std::cmp::Ordering {
    match (leading_number(left), leading_number(right)) {
        (Some(left_number), Some(right_number)) => {
            left_number.cmp(&right_number).then_with(|| left.cmp(right))
        }
        _ => left.cmp(right),
    }
}

/// The integer a task number leads with.
fn leading_number(text: &str) -> Option<i128> {
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}
