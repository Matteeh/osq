//! Running `land`: settings, the worktree lookup, the message, the commit and
//! the checkout's fast-forward.

mod after;
mod checks;
mod cleanup;
mod find;
mod message;
pub(crate) mod message_command;
mod sync;
pub(crate) mod sync_command;
mod text;
mod time;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::{Limits, ManualEdits, Timeouts, VcsConfig, load_config};
use osq_kernel_storage::{LandFacts, Location, list_changes, read_land_facts};
use osq_kernel_vcs::{FastForward, GitVcs, Vcs, Worktree, project_git_root};

use find::{Located, WorktreeChange};

/// The command every failure names.
const LAND: &str = "land";

/// Runs `land` for one query, returning its output text.
///
/// # Errors
///
/// Returns a `Failed` error with the command `land` for every failure the land
/// requirements name.
///
/// Implements: rust-land/land-settings
/// Implements: rust-land/land-lookup
/// Implements: rust-land/land-message
/// Implements: rust-land/land-commit
/// Implements: rust-land/land-refusals
/// Implements: rust-land/land-git-limits
/// Implements: rust-land/land-after-land-command
/// Implements: rust-land/land-after-land-retry
/// Implements: rust-vcs/project-root-check
pub(crate) fn run_land(root: &Path, query: &str) -> Result<String, FeatureError> {
    let config = load_config(root).map_err(|error| failed(error.to_string()))?;
    let repo_root = project_git_root(root, &config).map_err(|error| failed(error.to_string()))?;
    let (timeouts, settings, limits) = (config.timeouts, config.vcs, config.limits);
    let Some(repo_root) = repo_root else {
        return Err(failed(text::NEEDS_GIT));
    };
    let vcs = git_vcs(root, &timeouts);
    let default_branch = land_default_branch(&vcs, &settings, LAND)?;
    let worktrees = worktree_changes(&vcs, root, LAND)?;
    let located = locate(root, &vcs, &worktrees, &default_branch, query)?;
    let facts = land_facts(&located);
    check_refusals(
        &vcs,
        &timeouts,
        &worktrees,
        &located,
        facts.as_ref(),
        &default_branch,
    )?;
    if located.landed {
        return landed_output(&repo_root, &located, &settings, &timeouts, &limits);
    }
    let change = located
        .worktree
        .as_ref()
        .expect("a change that has not landed sits in a worktree");
    let facts = facts
        .as_ref()
        .expect("a change that has not landed sits in a worktree");
    let synced = sync_land(
        change,
        &located.folder,
        &default_branch,
        &settings,
        &timeouts,
        &limits,
    )?;
    let Some(tip) = worktree_head(change, &timeouts)? else {
        return Err(moved(&default_branch, &located.folder));
    };
    let Some(base) = checkout_head(&vcs)? else {
        return Err(moved(&default_branch, &located.folder));
    };
    if !vcs
        .is_ancestor(&base, &tip)
        .map_err(|error| failed(error.to_string()))?
    {
        return Err(moved(&default_branch, &located.folder));
    }
    let author = settings.author.clone().unwrap_or_default();
    let head = synced.as_deref().or(change.head.as_deref());
    let message = message::format(&located.folder, facts, head);
    let commit = vcs
        .commit_tree(&tip, &base, &message, &author, &[])
        .map_err(|error| failed(error.to_string()))?;
    match vcs.fast_forward(&commit) {
        Ok(FastForward::Done { changed }) => finish(
            &repo_root, &located, &settings, &timeouts, &limits, &commit, &changed,
        ),
        Ok(FastForward::Blocked { paths }) => {
            let block = settings.manual_edits == ManualEdits::Block;
            Err(failed(text::blocked(
                &paths,
                block,
                text::change_id(&located.folder),
            )))
        }
        Err(error) => {
            let head = checkout_head(&vcs)?;
            if head.as_deref() == Some(base.as_str()) {
                Err(failed(error.to_string()))
            } else {
                Err(moved(&default_branch, &located.folder))
            }
        }
    }
}

/// Runs the sync a land makes, which records its stops.
///
/// # Errors
///
/// Returns a `Failed` error with the command `land` for every stop "Land sync"
/// names.
///
/// Implements: rust-land/land-sync
fn sync_land(
    change: &WorktreeChange,
    folder: &str,
    default_branch: &str,
    settings: &VcsConfig,
    timeouts: &Timeouts,
    limits: &Limits,
) -> Result<Option<String>, FeatureError> {
    sync::run(
        &change.path,
        folder,
        default_branch,
        &sync::Controls {
            settings,
            timeouts,
            limits,
        },
        sync::Caller {
            command: LAND,
            records: true,
        },
    )
}

/// The output of a finished land, with its after-land lines when configured.
///
/// # Errors
///
/// Returns a `Failed` error with the command `land` when the after-land command
/// fails or its record cannot be written.
///
/// Implements: rust-land/land-commit
/// Implements: rust-land/land-cleanup
/// Implements: rust-land/land-after-land-command
fn finish(
    root: &Path,
    located: &Located,
    settings: &VcsConfig,
    timeouts: &Timeouts,
    limits: &Limits,
    commit: &str,
    changed: &[String],
) -> Result<String, FeatureError> {
    let cleanup = cleanup::run(root, settings, timeouts, &located.folder);
    let output = text::landed(
        &located.folder,
        commit,
        root,
        changed,
        cleanup.line.as_deref(),
    );
    let output = after::finish(
        root,
        &located.folder,
        settings.after_land.as_deref(),
        timeouts,
        limits,
        output,
    )?;
    if cleanup.failed {
        return Err(failed(output.trim_end_matches('\n')));
    }
    Ok(output)
}

/// The output for a change that already landed, with a retry when configured.
///
/// # Errors
///
/// Returns a `Failed` error with the command `land` when the after-land retry
/// fails or its record cannot be written.
///
/// Implements: rust-land/land-lookup
/// Implements: rust-land/land-cleanup
/// Implements: rust-land/land-after-land-retry
fn landed_output(
    root: &Path,
    located: &Located,
    settings: &VcsConfig,
    timeouts: &Timeouts,
    limits: &Limits,
) -> Result<String, FeatureError> {
    let cleanup = cleanup::run(root, settings, timeouts, &located.folder);
    let landed = match cleanup.line {
        Some(line) => format!("{} has already landed\n{line}\n", located.folder),
        None => text::landed_nothing(&located.folder),
    };
    let output = after::retry(
        root,
        &located.folder,
        settings.after_land.as_deref(),
        timeouts,
        limits,
        landed.clone(),
    )?;
    if cleanup.failed && output == landed {
        return Err(failed(landed.trim_end_matches('\n')));
    }
    Ok(output)
}

/// Runs every refusal before a land reports or writes, in its required order.
///
/// Implements: rust-land/land-refusals
fn check_refusals(
    vcs: &GitVcs,
    timeouts: &Timeouts,
    worktrees: &[WorktreeChange],
    located: &Located,
    facts: Option<&LandFacts>,
    default_branch: &str,
) -> Result<(), FeatureError> {
    if !located.landed {
        let facts = facts.expect("a change that has not landed sits in a worktree");
        if let Some(message) = checks::stacked(&located.folder, facts) {
            return Err(failed(message));
        }
    }

    let head = vcs.head().map_err(|error| failed(error.to_string()))?;
    if let Some(message) = checks::checkout_branch(default_branch, head.branch.as_deref()) {
        return Err(failed(message));
    }

    if let Some(change) = &located.worktree {
        let marker = change_archive(change, &located.folder)
            .join(".run")
            .join("regressed")
            .join("change.md");
        let marker = fs::read_to_string(marker).ok();
        if let Some(message) = checks::failed_archive_commit(&located.folder, marker.as_deref()) {
            return Err(failed(message));
        }
        let status = git_vcs(&change.path, timeouts)
            .status()
            .map_err(|error| failed(error.to_string()))?;
        if let Some(message) = checks::unclean_worktree(&change.path, &status) {
            return Err(failed(message));
        }
    }

    if located.landed {
        return Ok(());
    }
    let facts = facts.expect("a change that has not landed sits in a worktree");
    let compared = compared_changes(vcs, worktrees, default_branch)?;
    if let Some(message) = checks::earlier_change(&located.folder, facts, &compared) {
        return Err(failed(message));
    }
    Ok(())
}

/// Finds the archived change for `query`, in a worktree or on the checkout.
///
/// Implements: rust-land/land-lookup
fn locate(
    root: &Path,
    vcs: &GitVcs,
    worktrees: &[WorktreeChange],
    default_branch: &str,
    query: &str,
) -> Result<Located, FeatureError> {
    let archived = find::archived_change(worktrees, query).cloned();
    let folder = archived
        .as_ref()
        .map(|change| change.folder.clone())
        .or_else(|| archived_folder(root, query));
    if let Some(folder) = folder {
        let path = format!("openspec/changes/archive/{folder}");
        if vcs
            .path_exists(default_branch, &path)
            .map_err(|error| failed(error.to_string()))?
        {
            let worktree = worktrees
                .iter()
                .find(|change| change.folder == folder)
                .cloned();
            return Ok(Located {
                folder,
                worktree,
                landed: true,
            });
        }
    }
    if let Some(change) = find::active_change(worktrees, query) {
        return Err(failed(text::not_archived(&change.folder)));
    }
    match archived {
        Some(change) => Ok(Located {
            folder: change.folder.clone(),
            worktree: Some(change),
            landed: false,
        }),
        None => Err(failed(text::no_archived(query))),
    }
}

/// The land facts of the located change, or none when it has no worktree.
///
/// Implements: rust-land/land-refusals
fn land_facts(located: &Located) -> Option<LandFacts> {
    located
        .worktree
        .as_ref()
        .map(|change| read_land_facts(&change_archive(change, &located.folder)))
}

/// The first archived change of the checkout's listing that matches `query`.
///
/// Implements: rust-land/land-lookup
fn archived_folder(root: &Path, query: &str) -> Option<String> {
    list_changes(root)
        .into_iter()
        .find(|entry| {
            entry.location == Location::Archived && find::matches_folder(&entry.folder, query)
        })
        .map(|entry| entry.folder)
}

/// Every osq worktree change of `vcs`, in `worktree_list` order.
///
/// Implements: rust-land/land-lookup
pub(crate) fn worktree_changes(
    vcs: &GitVcs,
    root: &Path,
    command: &str,
) -> Result<Vec<WorktreeChange>, FeatureError> {
    let entries = vcs
        .worktree_list()
        .map_err(|error| failed_in(command, error.to_string()))?;
    let root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    Ok(entries
        .iter()
        .filter_map(|entry| worktree_change(entry, &root))
        .collect())
}

/// One worktree's change, unless it is the checkout or holds no such folder.
///
/// Implements: rust-land/land-lookup
fn worktree_change(entry: &Worktree, root: &Path) -> Option<WorktreeChange> {
    let folder = entry.branch.as_deref()?.strip_prefix("osq/")?;
    let path = PathBuf::from(&entry.path);
    let real = fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
    if real == root {
        return None;
    }
    let changes = path.join("openspec").join("changes");
    let active = changes.join(folder).is_dir();
    let archived = changes.join("archive").join(folder).is_dir();
    if !active && !archived {
        return None;
    }
    let head = entry
        .head
        .as_deref()
        .map(str::trim)
        .filter(|head| !head.is_empty())
        .map(str::to_owned);
    Some(WorktreeChange {
        folder: folder.to_owned(),
        path,
        head,
        active,
        archived,
    })
}

/// Every worktree change the earlier-change rule compares.
///
/// Implements: rust-land/land-refusals
fn compared_changes(
    vcs: &GitVcs,
    worktrees: &[WorktreeChange],
    default_branch: &str,
) -> Result<Vec<checks::ComparedChange>, FeatureError> {
    let mut compared = Vec::new();
    for change in worktrees.iter().filter(|change| change.archived) {
        let archived = format!("openspec/changes/archive/{}", change.folder);
        let landed = vcs
            .path_exists(default_branch, &archived)
            .map_err(|error| failed(error.to_string()))?;
        let approved = vcs
            .show(
                &format!("osq/{}", change.folder),
                &format!("{archived}/.run/approved"),
            )
            .map_err(|error| failed(error.to_string()))?
            .is_some();
        compared.push(checks::ComparedChange {
            folder: change.folder.clone(),
            facts: read_land_facts(&change_archive(change, &change.folder)),
            landed,
            approved,
        });
    }
    Ok(compared)
}

/// The archived folder of one worktree change.
///
/// Implements: rust-land/land-refusals
pub(crate) fn change_archive(change: &WorktreeChange, folder: &str) -> PathBuf {
    change
        .path
        .join("openspec")
        .join("changes")
        .join("archive")
        .join(folder)
}

/// The worktree's HEAD commit, when it has one.
///
/// Implements: rust-land/land-commit
fn worktree_head(
    change: &WorktreeChange,
    timeouts: &Timeouts,
) -> Result<Option<String>, FeatureError> {
    Ok(git_vcs(&change.path, timeouts)
        .head()
        .map_err(|error| failed(error.to_string()))?
        .sha)
}

/// The checkout's HEAD commit, when it has one.
///
/// Implements: rust-land/land-commit
fn checkout_head(vcs: &GitVcs) -> Result<Option<String>, FeatureError> {
    Ok(vcs.head().map_err(|error| failed(error.to_string()))?.sha)
}

/// The moved-land refusal for the folder, naming the default branch.
///
/// Implements: rust-land/land-commit
fn moved(default_branch: &str, folder: &str) -> FeatureError {
    failed(text::moved(default_branch, text::change_id(folder)))
}

/// The default branch the land uses, from settings or the remote head.
///
/// Implements: rust-land/land-settings
pub(crate) fn land_default_branch(
    vcs: &GitVcs,
    settings: &VcsConfig,
    command: &str,
) -> Result<String, FeatureError> {
    let fallback = settings
        .default_branch
        .as_deref()
        .unwrap_or(text::DEFAULT_BRANCH);
    vcs.default_branch(fallback)
        .map_err(|error| failed_in(command, error.to_string()))
}

/// A `GitVcs` at `root` bounded by the loaded config's `timeouts`.
///
/// Implements: rust-land/land-git-limits
pub(crate) fn git_vcs(root: &Path, timeouts: &Timeouts) -> GitVcs {
    GitVcs::new(root).with_timeouts(timeouts)
}

/// Builds the failed error for a land step.
fn failed(message: impl Into<String>) -> FeatureError {
    failed_in(LAND, message)
}

/// Builds the failed error for a command's step.
fn failed_in(command: &str, message: impl Into<String>) -> FeatureError {
    FeatureError::failed(command, message)
}
