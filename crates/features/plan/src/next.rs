//! The `plan --next` command: choose an item, write its change folder and hand off.

mod date;
mod files;
mod handoff;
mod number;
mod prompt;
mod report;
mod select;

use std::collections::BTreeMap;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_storage::ChangeSnapshot;

use crate::queue::{self, Groups};

/// Reads a `plan` invocation's arguments into whether it replans.
///
/// Implements: rust-plan/plan-arguments
pub(crate) fn arguments(args: &[String]) -> Result<bool, FeatureError> {
    let mut next = 0_usize;
    let mut replan = 0_usize;
    for argument in args {
        match argument.as_str() {
            "--next" => next += 1,
            "--replan" => replan += 1,
            _ => return Err(usage()),
        }
    }
    if next == 1 && replan <= 1 {
        Ok(replan == 1)
    } else {
        Err(usage())
    }
}

/// Builds the refusal for a `plan` invocation with other arguments.
///
/// Implements: rust-plan/plan-arguments
fn usage() -> FeatureError {
    FeatureError::usage("plan", "expected --next [--replan]")
}

/// Runs `plan --next` on `root` at `now_ms`, returning the handoff text.
///
/// Implements: rust-plan/plan-arguments
/// Implements: rust-plan/next-queue-item
/// Implements: rust-plan/next-change-number
/// Implements: rust-plan/change-folder-files
/// Implements: rust-plan/plan-handoff
/// Implements: rust-plan/plan-prompt
pub(crate) fn run_next(root: &Path, now_ms: i64, replan: bool) -> Result<String, FeatureError> {
    let failures = select::failures(&active_changes(root));
    if !failures.is_empty() {
        return Err(FeatureError::failed(
            "plan",
            select::failure_message(&failures),
        ));
    }
    let state = queue::read_state(root, "plan")?;
    let (item, _) =
        select::choose(&state, replan).map_err(|message| FeatureError::failed("plan", message))?;
    let number = number::next(root);
    let folder = format!("{number}-{}", item.slug);
    let dependencies = select::landed_ids(&item.dependencies, &state.groups);
    let fixes = select::landed_ids(&item.fixes, &state.groups);
    let paths = dependency_paths(&item.dependencies, &state.groups);
    let proposal = files::proposal(item, &dependencies, &fixes);
    let brief = files::brief(item, &date::utc_date(now_ms));
    let sections = report::sections(root)?;
    let prompt = prompt_text(root, &number, &folder, &proposal, &brief, &paths);
    let change = root.join("openspec").join("changes").join(&folder);
    write_folder(&change, &proposal, &brief)?;
    write(
        &change.join("plan-prompt.md"),
        &format!("{prompt}\n\n{sections}"),
    )?;
    let command = root
        .join(".claude")
        .join("commands")
        .join("osq-plan.md")
        .is_file();
    Ok(handoff::format(root, &folder, &number, command))
}

/// Reads each active change folder that has a proposal or a spec.
///
/// Implements: rust-plan/next-queue-item
fn active_changes(root: &Path) -> Vec<(String, ChangeSnapshot)> {
    let mut changes = Vec::new();
    let groups = queue::scan_folders(root);
    for folder in groups.values().flat_map(|groups| &groups.active) {
        if !folder.entry.path.join("proposal.md").is_file()
            && !folder.entry.path.join("spec.md").is_file()
        {
            continue;
        }
        if let Ok(snapshot) = osq_kernel_storage::read_change(&folder.entry) {
            changes.push((folder.entry.folder.clone(), snapshot));
        }
    }
    changes
}

/// Writes a new change folder's proposal, tasks, first task and brief.
///
/// Implements: rust-plan/change-folder-files
fn write_folder(change: &Path, proposal: &str, brief: &str) -> Result<(), FeatureError> {
    let tasks = change.join("tasks");
    std::fs::create_dir_all(&tasks).map_err(|source| write_error(&tasks, &source))?;
    write(&change.join("proposal.md"), proposal)?;
    write(&change.join("tasks.md"), files::TASKS_MD)?;
    write(&tasks.join("1.md"), files::TASK_1_MD)?;
    write(&change.join("brief.md"), brief)
}

/// Writes one file, naming it when the write fails.
///
/// Implements: rust-plan/change-folder-files
fn write(path: &Path, text: &str) -> Result<(), FeatureError> {
    std::fs::write(path, text).map_err(|source| write_error(path, &source))
}

/// Builds `plan-prompt.md`'s first sections from the files and folders it names.
///
/// Implements: rust-plan/plan-prompt
fn prompt_text(
    root: &Path,
    id: &str,
    folder: &str,
    proposal: &str,
    brief: &str,
    paths: &[String],
) -> String {
    let planner = planner(root);
    let title = osq_kernel_storage::frontmatter_string(proposal, "title");
    let capabilities = capabilities(root);
    let decisions =
        osq_kernel_specs::read_decisions(root, Path::new("decisions"), Path::new("openspec")).adrs;
    let input = prompt::Prompt {
        planner: planner.as_deref(),
        id,
        title: title.as_deref(),
        folder,
        dependencies: paths,
        capabilities: &capabilities,
        decisions: &decisions,
        brief,
    };
    prompt::build(&input)
}

/// Reads `<root>/PLANNER.md`, or none when it cannot be read.
///
/// Implements: rust-plan/plan-prompt
fn planner(root: &Path) -> Option<String> {
    std::fs::read_to_string(root.join("PLANNER.md")).ok()
}

/// Reads the names of the capability folders directly under `openspec/specs`.
///
/// Implements: rust-plan/plan-prompt
fn capabilities(root: &Path) -> Vec<String> {
    let directory = root.join("openspec").join("specs");
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// Builds the archived folder path of each landed dependency, in order.
///
/// Implements: rust-plan/plan-prompt
fn dependency_paths(slugs: &[String], groups: &BTreeMap<String, Groups>) -> Vec<String> {
    let mut paths = Vec::new();
    for slug in slugs {
        let Some(group) = groups.get(slug) else {
            continue;
        };
        if group.archived.len() != 1 {
            continue;
        }
        paths.push(format!(
            "openspec/changes/archive/{}",
            group.archived[0].entry.folder
        ));
    }
    paths
}

/// Builds the failure for a folder or file that cannot be written.
///
/// Implements: rust-plan/change-folder-files
fn write_error(path: &Path, source: &std::io::Error) -> FeatureError {
    FeatureError::failed("plan", format!("Cannot write {}: {source}", path.display()))
}
