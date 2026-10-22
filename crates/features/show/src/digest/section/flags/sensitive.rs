//! The shared-file and sensitive-path flags.

use std::collections::{BTreeMap, BTreeSet};

use super::tasks::compare_numbers;
use super::{Flag, TaskView};

/// The sensitive kinds in the order their flags are emitted.
const SENSITIVE_KINDS: [&str; 7] = [
    "package manifest",
    "lockfile",
    "CI workflow",
    "osq config",
    "OpenSpec config",
    "managed instructions",
    "env file",
];
/// The package manifest file names.
const PACKAGE_MANIFEST_BASENAMES: [&str; 5] = [
    "package.json",
    "pnpm-workspace.yaml",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
];
/// The lockfile file names.
const LOCKFILE_BASENAMES: [&str; 10] = [
    "pnpm-lock.yaml",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    "poetry.lock",
    "uv.lock",
    "Cargo.lock",
    "go.sum",
];
/// The osq config file names.
const OSQ_CONFIG_BASENAMES: [&str; 3] = ["osq.config.ts", "osq.config.js", "osq.config.mjs"];
/// The managed instruction file names.
const MANAGED_INSTRUCTION_BASENAMES: [&str; 3] = ["AGENTS.md", "PLANNER.md", "CLAUDE.md"];
/// The environment template file names that are not sensitive.
const ENV_TEMPLATE_BASENAMES: [&str; 3] = [".env.example", ".env.sample", ".env.template"];
/// The managed Claude plan command's project-relative path.
const CLAUDE_PLAN_COMMAND_PATH: &str = ".claude/commands/osq-plan.md";

/// One flag per task pair sharing any resolved scope path.
pub(super) fn shared_files(tasks: &[TaskView]) -> Vec<Flag> {
    let mut ordered: Vec<&TaskView> = tasks.iter().collect();
    ordered.sort_by(|left, right| compare_numbers(&left.number, &right.number));
    let mut flags = Vec::new();
    for (left_index, first) in ordered.iter().enumerate() {
        for second in ordered.iter().skip(left_index.saturating_add(1)) {
            let mut shared: Vec<&String> = first
                .paths
                .iter()
                .filter(|path| second.paths.contains(path))
                .collect();
            if shared.is_empty() {
                continue;
            }
            shared.sort();
            let names = shared
                .into_iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                .join(", ");
            flags.push(Flag::new(
                format!(
                    "shared files in tasks {} and {}",
                    first.number, second.number
                ),
                format!(
                    "{names}; when task {} changes them, the watcher re-runs task {}'s verify and halts only if it fails",
                    second.number, first.number
                ),
            ));
        }
    }
    flags
}

/// One flag per sensitive kind present, naming each path and its tasks.
pub(super) fn sensitive_paths(tasks: &[TaskView], openspec: &str) -> Vec<Flag> {
    let mut by_kind: BTreeMap<&'static str, BTreeMap<String, BTreeSet<String>>> = BTreeMap::new();
    for task in tasks {
        for path in &task.paths {
            let Some(kind) = sensitive_kind(path, openspec) else {
                continue;
            };
            by_kind
                .entry(kind)
                .or_default()
                .entry(path.clone())
                .or_default()
                .insert(task.number.clone());
        }
    }
    let mut flags = Vec::new();
    for kind in SENSITIVE_KINDS {
        let Some(paths) = by_kind.get(kind) else {
            continue;
        };
        if paths.is_empty() {
            continue;
        }
        let entries: Vec<String> = paths
            .iter()
            .map(|(path, numbers)| format!("{path} in {}", task_phrase(numbers)))
            .collect();
        flags.push(Flag::new(format!("{kind} in scope"), entries.join("; ")));
    }
    flags
}

/// One task-number phrase, sorted as TypeScript sorts task numbers.
fn task_phrase(numbers: &BTreeSet<String>) -> String {
    let mut sorted: Vec<&String> = numbers.iter().collect();
    sorted.sort_by(|left, right| compare_numbers(left, right));
    if let [only] = sorted.as_slice() {
        return format!("task {only}");
    }
    let text: Vec<&str> = sorted.into_iter().map(String::as_str).collect();
    format!("tasks {}", text.join(", "))
}

/// The first sensitive kind a resolved path matches, or none.
fn sensitive_kind(path: &str, openspec: &str) -> Option<&'static str> {
    let name = basename(path);
    if PACKAGE_MANIFEST_BASENAMES.contains(&name) {
        return Some("package manifest");
    }
    if LOCKFILE_BASENAMES.contains(&name) {
        return Some("lockfile");
    }
    if path.starts_with(".github/workflows/") || path == ".gitlab-ci.yml" {
        return Some("CI workflow");
    }
    if OSQ_CONFIG_BASENAMES.contains(&name) {
        return Some("osq config");
    }
    if path == format!("{openspec}/config.yaml") {
        return Some("OpenSpec config");
    }
    if MANAGED_INSTRUCTION_BASENAMES.contains(&name)
        || path == CLAUDE_PLAN_COMMAND_PATH
        || path.starts_with(".opencode/agent/")
    {
        return Some("managed instructions");
    }
    if is_env_file(name) && !ENV_TEMPLATE_BASENAMES.contains(&name) {
        return Some("env file");
    }
    None
}

/// The text after the last slash.
fn basename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// Whether a basename is an environment file, including `.env` itself.
fn is_env_file(name: &str) -> bool {
    name == ".env"
        || name
            .strip_prefix(".env.")
            .is_some_and(|rest| !rest.is_empty())
}
