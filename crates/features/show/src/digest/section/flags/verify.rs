//! The verify-without-a-test and verify-starts-conflict flags.

use std::path::Path;

use osq_kernel_specs::VerifyStarts;

use super::paths;
use super::tasks::compare_numbers;
use super::{Flag, TaskView};

/// Command markers that name a recognized test runner.
const RUNNER_MARKERS: [&str; 7] = [
    "--test",
    "vitest",
    "jest",
    "mocha",
    "pytest",
    "go test",
    "cargo test",
];
/// Package scripts that name a test or verify run.
const PACKAGE_RUNNERS: [&str; 4] = ["pnpm", "npm", "yarn", "bun"];

/// One flag per task and proposal verify that names no test file or runner.
pub(super) fn without_test(tasks: &[TaskView], proposal: &str) -> Vec<Flag> {
    let mut ordered: Vec<&TaskView> = tasks.iter().collect();
    ordered.sort_by(|left, right| compare_numbers(&left.number, &right.number));
    let mut flags = Vec::new();
    for task in ordered {
        if lacks_test(&task.verify) {
            flags.push(Flag::new(
                "verify_without_test",
                format!("verify without a test in task {}", task.number),
                task.verify.clone(),
            ));
        }
    }
    if lacks_test(proposal) {
        flags.push(Flag::new(
            "verify_without_test",
            "verify without a test in the proposal",
            proposal,
        ));
    }
    flags
}

/// True when a command names neither a test file nor a recognized runner.
fn lacks_test(command: &str) -> bool {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.contains(".test.") || trimmed.contains(".spec.") {
        return false;
    }
    if has_test_folder(trimmed) {
        return false;
    }
    if RUNNER_MARKERS.iter().any(|marker| trimmed.contains(marker)) {
        return false;
    }
    !names_package_script(trimmed)
}

/// True when a path segment names a test folder.
fn has_test_folder(command: &str) -> bool {
    let mut previous: Option<char> = None;
    for (index, character) in command.char_indices() {
        let boundary =
            index == 0 || previous.is_some_and(|before| before == '/' || before.is_whitespace());
        if boundary {
            let rest = &command[index..];
            if rest.starts_with("test/")
                || rest.starts_with("tests/")
                || rest.starts_with("__tests__/")
            {
                return true;
            }
        }
        previous = Some(character);
    }
    false
}

/// True when a command runs a package manager's test or verify script.
fn names_package_script(command: &str) -> bool {
    for (index, _) in command.char_indices() {
        let boundary = index == 0 || !is_word(character_before(command, index));
        if !boundary {
            continue;
        }
        let rest = &command[index..];
        let Some(mut tail) = PACKAGE_RUNNERS
            .iter()
            .find_map(|runner| rest.strip_prefix(runner))
        else {
            continue;
        };
        let Some(after_space) = tail.strip_prefix(char::is_whitespace) else {
            continue;
        };
        tail = after_space.trim_start_matches(char::is_whitespace);
        if let Some(after_run) = tail.strip_prefix("run")
            && let Some(after_run_space) = after_run.strip_prefix(char::is_whitespace)
        {
            tail = after_run_space.trim_start_matches(char::is_whitespace);
        }
        for script in ["test", "verify"] {
            if let Some(remainder) = tail.strip_prefix(script)
                && remainder.chars().next().is_none_or(|next| !is_word(next))
            {
                return true;
            }
        }
    }
    false
}

/// The character before a byte index, when there is one.
fn character_before(text: &str, index: usize) -> char {
    text.get(..index)
        .and_then(|prefix| prefix.chars().next_back())
        .unwrap_or(' ')
}

/// Whether a character is part of a JavaScript regex word.
fn is_word(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

/// One flag per task that declares `green` or `any` while creating its own path.
pub(super) fn starts_conflicts(root: &Path, tasks: &[TaskView]) -> Vec<Flag> {
    let mut ordered: Vec<&TaskView> = tasks.iter().collect();
    ordered.sort_by(|left, right| compare_numbers(&left.number, &right.number));
    let mut earlier: Vec<Vec<String>> = Vec::new();
    let mut conflicts: Vec<(String, String, &'static str)> = Vec::new();
    for task in ordered {
        for named in paths::missing_named(root, &task.verify) {
            if earlier
                .iter()
                .any(|scope| paths::covers_named(scope, &named))
            {
                continue;
            }
            let own = paths::covers_named(&task.scope, &named);
            if own && task.starts != VerifyStarts::Red {
                conflicts.push((task.number.clone(), named, start_name(task.starts)));
            }
        }
        earlier.push(task.scope.clone());
    }
    conflicts.sort_by(|left, right| {
        compare_numbers(&left.0, &right.0).then_with(|| left.1.cmp(&right.1))
    });
    conflicts
        .into_iter()
        .map(|(number, named, start)| {
            Flag::new(
                "verify_starts_conflict",
                format!("verify starts conflict in task {number}"),
                format!(
                    "{named} is named by the verify but created by this task, which declares verify_starts: {start}"
                ),
            )
        })
        .collect()
}

/// The name TypeScript prints for a verify start.
fn start_name(starts: VerifyStarts) -> &'static str {
    match starts {
        VerifyStarts::Green => "green",
        VerifyStarts::Any => "any",
        VerifyStarts::Red => "red",
    }
}
