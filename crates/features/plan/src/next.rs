//! The `plan --next` command: choose an item, write its change folder and hand off.

pub(crate) mod date;
pub(crate) mod files;
pub(crate) mod handoff;
pub(crate) mod number;
mod prompt;
mod report;
mod select;

use std::collections::BTreeMap;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::load_config;
use osq_kernel_storage::ChangeSnapshot;
use osq_kernel_vcs::project_git_root;

use crate::queue::{self, Groups};

/// Runs `plan --next` on `root` at `now_ms`, returning the handoff text.
///
/// Implements: rust-plan/plan-arguments
/// Implements: rust-plan/next-queue-item
/// Implements: rust-plan/next-change-number
/// Implements: rust-plan/change-folder-files
/// Implements: rust-plan/plan-handoff
/// Implements: rust-plan/plan-prompt
pub(crate) fn run_next(
    root: &Path,
    now_ms: i64,
    replan: bool,
    print: bool,
) -> Result<String, FeatureError> {
    let config =
        load_config(root).map_err(|error| FeatureError::failed("plan", error.to_string()))?;
    let git_root = project_git_root(root, &config)
        .map_err(|error| FeatureError::failed("plan", error.to_string()))?;
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
    let number = number::next(root, &config, git_root.as_deref())
        .map_err(|message| FeatureError::failed("plan", message))?;
    let folder = format!("{number}-{}", item.slug);
    let dependencies = select::landed_ids(&item.dependencies, &state.groups);
    let fixes = select::landed_ids(&item.fixes, &state.groups);
    let paths = dependency_paths(&item.dependencies, &state.groups);
    let proposal = files::proposal(item, &dependencies, &fixes);
    let brief = files::brief(item, &date::utc_date(now_ms));
    let sections = report::sections(root)?;
    let title = osq_kernel_storage::frontmatter_string(&proposal, "title");
    let prompt = opening_prompt(root, &number, title.as_deref(), &folder, &paths, &brief);
    let change = root.join("openspec").join("changes").join(&folder);
    write_folder(&change, &proposal, &brief)?;
    let text = format!("{prompt}\n\n{sections}");
    if print {
        return Ok(format!("{text}\n"));
    }
    write(&change.join("plan-prompt.md"), &text)?;
    let command = root
        .join(".claude")
        .join("commands")
        .join("osq-plan.md")
        .is_file();
    Ok(handoff::format(&change, &number, "unplanned", command))
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
pub(crate) fn write_folder(change: &Path, proposal: &str, brief: &str) -> Result<(), FeatureError> {
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
pub(crate) fn write(path: &Path, text: &str) -> Result<(), FeatureError> {
    std::fs::write(path, text).map_err(|source| write_error(path, &source))
}

/// Builds `plan-prompt.md`'s first sections from the values a plan gives.
///
/// Implements: rust-plan/plan-prompt
/// Implements: rust-plan/steering-prompt
pub(crate) fn opening_prompt(
    root: &Path,
    id: &str,
    title: Option<&str>,
    folder: &str,
    dependencies: &[String],
    brief: &str,
) -> String {
    let planner = planner(root);
    let capabilities = capabilities(root);
    let decisions =
        osq_kernel_specs::read_decisions(root, Path::new("decisions"), Path::new("openspec")).adrs;
    let input = prompt::Prompt {
        planner: planner.as_deref(),
        id,
        title,
        folder,
        dependencies,
        capabilities: &capabilities,
        decisions: &decisions,
        brief,
    };
    prompt::build(&input)
}

/// Reads the plan prompt's sections after `## Brief`.
///
/// Implements: rust-plan/plan-prompt
/// Implements: rust-plan/steering-prompt
pub(crate) fn sections(root: &Path) -> Result<String, FeatureError> {
    report::sections(root)
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
