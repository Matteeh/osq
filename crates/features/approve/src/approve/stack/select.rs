//! Selecting what a change waits for, as TypeScript's `awaitedForApproval` does.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_specs::read_proposal;
use osq_kernel_storage::ChangeEntry;
use osq_kernel_vcs::GitVcs;

use super::super::find;
use super::{Awaited, capabilities, changes, state};

/// The reads shared by one selection: the repository, its changes and their
/// first paths.
struct Context<'a> {
    /// The repository root git names.
    repo: &'a Path,
    /// The settings.
    config: &'a Config,
    /// The repository's git reads.
    vcs: &'a GitVcs,
    /// Every change folder the root, its worktrees and stacked approvals hold.
    entries: &'a [ChangeEntry],
    /// Each folder's first path in `entries`.
    paths: BTreeMap<String, PathBuf>,
}

/// The entries `folder` at `path` waits for: declared dependencies, then its
/// own overlap lines that still await.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` and the display of a
/// git error when a read fails.
///
/// Implements: rust-approve/stacked-approval
pub(crate) fn awaited(
    root: &Path,
    config: &Config,
    repo: &Path,
    path: &Path,
    folder: &str,
) -> Result<Vec<Awaited>, FeatureError> {
    let vcs = GitVcs::new(repo).with_timeouts(&config.timeouts);
    let entries = changes::list(root, config, &vcs)?;
    let paths = first_paths(&entries);
    let context = Context {
        repo,
        config,
        vcs: &vcs,
        entries: &entries,
        paths,
    };
    let declared = read_entries(&context, path)?;
    let overlaps = overlaps(&context, path, folder)?;
    if overlaps.is_empty() {
        return Ok(declared);
    }
    let endpoints = endpoints(&declared, &overlaps);
    let closures = closures(&context, &endpoints)?;
    let mut named: BTreeSet<String> = declared.iter().map(|entry| entry.folder.clone()).collect();
    let mut result = declared;
    for overlap in overlaps {
        if named.contains(&overlap.folder) {
            continue;
        }
        let awaited_by_other = endpoints.iter().any(|other| {
            other != &overlap.folder
                && closures
                    .get(other)
                    .is_some_and(|closure| closure.contains(&overlap.folder))
        });
        if awaited_by_other {
            continue;
        }
        named.insert(overlap.folder.clone());
        result.push(overlap);
    }
    Ok(result)
}

/// Each folder's first path in the listed changes.
///
/// Implements: rust-approve/stacked-approval
fn first_paths(entries: &[ChangeEntry]) -> BTreeMap<String, PathBuf> {
    let mut paths = BTreeMap::new();
    for entry in entries {
        paths
            .entry(entry.folder.clone())
            .or_insert_with(|| entry.path.clone());
    }
    paths
}

/// The entries one change folder at `path` waits for.
///
/// Implements: rust-approve/stacked-approval
fn read_entries(context: &Context<'_>, path: &Path) -> Result<Vec<Awaited>, FeatureError> {
    let mut awaited = Vec::new();
    let mut named = BTreeSet::new();
    let proposal = read_proposal(&path.join("proposal.md")).ok();
    for id in proposal
        .map(|proposal| proposal.depends_on)
        .unwrap_or_default()
    {
        let Some(entry) = context
            .entries
            .iter()
            .find(|entry| find::matches(&entry.folder, &id))
        else {
            continue;
        };
        if named.contains(&entry.folder) {
            continue;
        }
        let Some(hash) = state::read(context.vcs, context.config, context.repo, &entry.folder)?
            .hash()
            .map(str::to_owned)
        else {
            continue;
        };
        named.insert(entry.folder.clone());
        awaited.push(Awaited {
            folder: entry.folder.clone(),
            hash,
            overlap: None,
        });
    }
    let text = fs::read_to_string(path.join(".run/stacked-on")).unwrap_or_default();
    for line in text.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 4 || fields[2] != "overlap" {
            continue;
        }
        let folder = fields[0];
        if named.contains(folder) {
            continue;
        }
        if state::read(context.vcs, context.config, context.repo, folder)?
            .hash()
            .is_none()
        {
            continue;
        }
        named.insert(folder.to_owned());
        awaited.push(Awaited {
            folder: folder.to_owned(),
            hash: fields[1].to_owned(),
            overlap: Some(
                fields[3]
                    .split(',')
                    .filter(|part| !part.is_empty())
                    .map(str::to_owned)
                    .collect(),
            ),
        });
    }
    Ok(awaited)
}

/// Each other awaited folder that shares a delta capability, sorted by folder.
///
/// Implements: rust-approve/stacked-approval
fn overlaps(
    context: &Context<'_>,
    path: &Path,
    folder: &str,
) -> Result<Vec<Awaited>, FeatureError> {
    let own = capabilities::read(path);
    if own.is_empty() {
        return Ok(Vec::new());
    }
    let mut seen: BTreeSet<String> = BTreeSet::from([folder.to_owned()]);
    let mut overlaps = Vec::new();
    for entry in context.entries {
        if !seen.insert(entry.folder.clone()) {
            continue;
        }
        let shared: Vec<String> = capabilities::read(&entry.path)
            .intersection(&own)
            .cloned()
            .collect();
        if shared.is_empty() {
            continue;
        }
        let Some(hash) = state::read(context.vcs, context.config, context.repo, &entry.folder)?
            .hash()
            .map(str::to_owned)
        else {
            continue;
        };
        overlaps.push(Awaited {
            folder: entry.folder.clone(),
            hash,
            overlap: Some(shared),
        });
    }
    overlaps.sort_by(|left, right| left.folder.cmp(&right.folder));
    Ok(overlaps)
}

/// Every endpoint folder, once, from the declared entries and the overlaps.
///
/// Implements: rust-approve/stacked-approval
fn endpoints(declared: &[Awaited], overlaps: &[Awaited]) -> BTreeSet<String> {
    declared
        .iter()
        .chain(overlaps)
        .map(|entry| entry.folder.clone())
        .collect()
}

/// Each endpoint's closure, computed once.
///
/// Implements: rust-approve/stacked-approval
fn closures(
    context: &Context<'_>,
    endpoints: &BTreeSet<String>,
) -> Result<BTreeMap<String, BTreeSet<String>>, FeatureError> {
    let mut closures = BTreeMap::new();
    for endpoint in endpoints {
        closures.insert(endpoint.clone(), closure(context, endpoint)?);
    }
    Ok(closures)
}

/// Every folder reached by following awaited entries from `start`, leaving out
/// `start` itself.
///
/// Implements: rust-approve/stacked-approval
fn closure(context: &Context<'_>, start: &str) -> Result<BTreeSet<String>, FeatureError> {
    let mut reached = BTreeSet::new();
    let mut seen: BTreeSet<String> = BTreeSet::from([start.to_owned()]);
    let mut stack = vec![start.to_owned()];
    while let Some(current) = stack.pop() {
        let Some(path) = context.paths.get(&current) else {
            continue;
        };
        for entry in read_entries(context, path)? {
            reached.insert(entry.folder.clone());
            if seen.insert(entry.folder.clone()) {
                stack.push(entry.folder);
            }
        }
    }
    reached.remove(start);
    Ok(reached)
}
